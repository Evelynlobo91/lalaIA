import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { CONTROL_BY_ACTION, type LiveActor, type StreamAction, type StreamControlStore, type StreamRecord, type StreamRepository } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import type { PrivacyGate } from "../privacy/privacy.use-case";

const notAllowed = () => err(new ForbiddenError("Só o responsável pela transmissão (ou um administrador) pode controlá-la."));

/**
 * RF23/RNF15 — Ativar, pausar ou encerrar (dono ou admin). Idempotente.
 * - Encerrar chama `disable` no provedor ANTES de gravar: a ingestão cai na hora, mesmo se o banco falhar
 *   (repetir o comando completa). O player some no próximo ciclo de status.
 * - Pausar só oculta o player (status `paused`); a ingestão continua e "ativar" volta na hora.
 * - Ativar uma transmissão encerrada reabilita a chave no provedor.
 * - Ativar exige que o dono tenha aceitado as diretrizes de privacidade vigentes (#55).
 */
export class ControlStream {
  constructor(
    private readonly streams: Pick<StreamRepository, "findById">,
    private readonly control: Pick<StreamControlStore, "setControl">,
    private readonly provider: () => StreamingProvider,
    private readonly events: DomainEventPublisher,
    private readonly privacy: Pick<PrivacyGate, "check">,
  ) {}

  async execute(actor: LiveActor, streamId: string, action: StreamAction): Promise<Result<StreamRecord, DomainError>> {
    const stream = await this.streams.findById(streamId);
    if (!stream) return err(new NotFoundError("Transmissão"));
    if (stream.ownerId !== actor.id && !actor.isAdmin) return notAllowed();

    const change = CONTROL_BY_ACTION[action];
    if (stream.control === change.control) return ok(stream);
    if (action === "pause" && stream.control === "ended") {
      return err(new BusinessRuleError("stream_ended", "A transmissão está encerrada. Ative de novo antes de pausar."));
    }
    if (action === "activate") {
      // Vale o aceite do dono, mesmo quando é um admin que ativa.
      const accepted = await this.privacy.check(stream.ownerId, "activate");
      if (!accepted.ok) return accepted;
    }

    if (action === "end") await this.provider().disable(stream.providerStreamId);
    if (action === "activate" && stream.control === "ended") await this.provider().enable(stream.providerStreamId);

    const updated = await this.control.setControl(actor.id, stream.id, change);
    if (!updated) return notAllowed();
    if (updated.status !== stream.status) {
      await this.events.publish("live.StreamStatusChanged", { streamId: updated.id, entityType: updated.entityType, entityId: updated.entityId, status: updated.status });
    }
    return ok(updated);
  }
}

/** Evento cancelado (módulo events) → encerra a live dele: desativa a chave e some o player. Idempotente. */
export class EndStreamOfCancelledEvent {
  constructor(
    private readonly streams: Pick<StreamRepository, "findByTarget">,
    private readonly control: Pick<StreamControlStore, "endBySystem">,
    private readonly provider: () => StreamingProvider,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(eventId: string): Promise<void> {
    const stream = await this.streams.findByTarget({ entityType: "event", entityId: eventId });
    if (!stream || stream.control === "ended") return;
    await this.provider().disable(stream.providerStreamId);
    const ended = await this.control.endBySystem(stream.id);
    if (ended && ended.status !== stream.status) {
      await this.events.publish("live.StreamStatusChanged", { streamId: ended.id, entityType: ended.entityType, entityId: ended.entityId, status: ended.status });
    }
  }
}

/**
 * LGPD (#25) — A pessoa excluiu a conta: desliga no provedor todas as transmissões dela antes que os
 * registros saiam em cascata (senão a chave continuaria aceitando vídeo). Melhor-esforço por transmissão.
 */
export class EndStreamsOfDeletedUser {
  constructor(
    private readonly streams: Pick<StreamRepository, "listByOwner">,
    private readonly provider: () => StreamingProvider,
    private readonly log: { warn(message: string, fields?: Record<string, unknown>): void },
  ) {}

  async execute(userId: string): Promise<void> {
    const mine = await this.streams.listByOwner(userId);
    await Promise.all(
      mine.map((s) =>
        this.provider()
          .disable(s.providerStreamId)
          .catch((error: unknown) => this.log.warn("não foi possível desligar a transmissão no provedor (conta excluída)", { streamId: s.id, err: error })),
      ),
    );
  }
}
