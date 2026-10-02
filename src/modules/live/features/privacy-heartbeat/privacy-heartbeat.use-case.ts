import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { UnauthorizedError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { StreamRecord } from "../../domain/stream";

/** Sem heartbeat há mais que isso, o agente é dado como fora do ar (ele envia a cada ~10 s). */
export const HEARTBEAT_FRESH_SECONDS = 30;

/** Corpo enviado pelo agente (`tools/face-blur-agent/face_blur_agent/heartbeat.py`). Só números. */
export const heartbeatSchema = z.object({
  privacy_mode: z.enum(["on", "off"]),
  blur_mode: z.enum(["faces", "full"]),
  fps: z.number().min(0).max(240),
  faces_per_frame: z.number().min(0).max(1000),
  detector_status: z.string().trim().min(1).max(60),
  sent_at: z.number().optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export type AgentHeartbeat = { streamId: string; privacyMode: "on" | "off"; blurMode: "faces" | "full"; fps: number; facesPerFrame: number; detectorStatus: string; receivedAt: Date };

/**
 * Situação do agente de borrão de uma transmissão:
 * - `protected`: heartbeat recente com o modo privacidade ligado (rostos ou quadro inteiro borrados);
 * - `off`: o agente avisou que o modo privacidade está desligado;
 * - `stale`: já conectou, mas está sem sinal;
 * - `none`: nunca conectou (transmissão sem agente: vale a declaração do parceiro, #55).
 */
export type PrivacyStatus = "protected" | "off" | "stale" | "none";

export function privacyStatusOf(heartbeat: Pick<AgentHeartbeat, "privacyMode" | "receivedAt"> | null, now: Date): PrivacyStatus {
  if (!heartbeat) return "none";
  if (now.getTime() - heartbeat.receivedAt.getTime() > HEARTBEAT_FRESH_SECONDS * 1000) return "stale";
  return heartbeat.privacyMode === "on" ? "protected" : "off";
}

export interface AgentHeartbeatStore {
  /** Transmissão dona desta chave (o agente se autentica com a chave de transmissão); null se a chave não existe. */
  streamByKey(streamKey: string): Promise<StreamRecord | null>;
  save(streamId: string, heartbeat: HeartbeatInput): Promise<AgentHeartbeat>;
  /** Último heartbeat de cada transmissão pedida. */
  latest(streamIds: string[]): Promise<AgentHeartbeat[]>;
  /** Pausa pelo sistema (sem usuário), com registro no log de ciclo de vida. null se já não estava no ar. */
  pauseBySystem(streamId: string): Promise<StreamRecord | null>;
}

type Logger = { warn(message: string, fields?: Record<string, unknown>): void };

/**
 * #198 — Recebe o heartbeat do agente de borrão. A chave de transmissão identifica a transmissão (o agente já a
 * tem para transmitir). Se o agente avisar que o modo privacidade está DESLIGADO com a transmissão ativa, a
 * plataforma pausa a live na hora: nada vai ao ar sem proteção. Encerrada, o heartbeat é só registrado.
 */
export class RecordAgentHeartbeat {
  constructor(
    private readonly store: AgentHeartbeatStore,
    private readonly events: DomainEventPublisher,
    private readonly log: Logger,
  ) {}

  async execute(streamKey: string | null, input: HeartbeatInput): Promise<Result<{ status: PrivacyStatus; paused: boolean }, DomainError>> {
    const stream = streamKey ? await this.store.streamByKey(streamKey) : null;
    if (!stream) return err(new UnauthorizedError("Chave de transmissão inválida."));

    const saved = await this.store.save(stream.id, input);
    if (saved.privacyMode === "on" || stream.control !== "on") return ok({ status: saved.privacyMode === "on" ? "protected" : "off", paused: false });

    const paused = await this.store.pauseBySystem(stream.id);
    if (paused) {
      this.log.warn("live pausada: agente de borrão com o modo privacidade desligado", { streamId: stream.id });
      await this.events.publish("live.StreamStatusChanged", { streamId: stream.id, entityType: stream.entityType, entityId: stream.entityId, status: paused.status });
    }
    return ok({ status: "off", paused: paused !== null });
  }
}

export type AgentStatusView = { status: PrivacyStatus; blurMode: "faces" | "full" | null; fps: number | null; detectorStatus: string | null; lastSeenAt: Date | null };

/** Situação do agente de cada transmissão (portal do parceiro e backoffice). */
export class GetAgentStatus {
  constructor(
    private readonly store: Pick<AgentHeartbeatStore, "latest">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(streamIds: string[]): Promise<Record<string, AgentStatusView>> {
    const now = this.now();
    const beats = new Map((streamIds.length > 0 ? await this.store.latest(streamIds) : []).map((b) => [b.streamId, b]));
    return Object.fromEntries(
      streamIds.map((id) => {
        const b = beats.get(id) ?? null;
        return [id, { status: privacyStatusOf(b, now), blurMode: b?.blurMode ?? null, fps: b?.fps ?? null, detectorStatus: b?.detectorStatus ?? null, lastSeenAt: b?.receivedAt ?? null }];
      }),
    );
  }

  /** O público vê "rostos desfocados automaticamente" só com o agente protegendo agora. */
  async isProtected(streamId: string): Promise<boolean> {
    return (await this.execute([streamId]))[streamId]?.status === "protected";
  }
}
