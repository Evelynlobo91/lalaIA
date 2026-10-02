import { z } from "zod";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { NO_REACTIONS, type LiveReactionStore, type ReactionTotals } from "../react-to-live/react-to-live.use-case";
import type { ChatEntitlement, ChatRoomReader } from "../send-chat-message/send-chat-message.use-case";

/** De quanto em quanto tempo cada aba avisa que está assistindo (e recebe os contadores). */
export const PULSE_MS = 5_000;
/** Aba sem batimento há mais que isso deixa de contar como espectador. */
export const PRESENCE_WINDOW_SECONDS = 15;

export const pulseSchema = z.object({
  streamId: z.uuid(),
  /** Id aleatório da aba (não é a conta): só serve para contar espectadores sem repetir. */
  viewerId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/** Presença: batimentos das abas com a live aberta (efêmero, sem relação com a conta). */
export interface PresenceStore {
  /** Registra o batimento e devolve quantas abas bateram dentro da janela. */
  beat(streamId: string, viewerId: string, windowSeconds: number): Promise<number>;
  /** Quantas abas estão assistindo agora, por transmissão (para o portal do parceiro). */
  viewersNow(streamIds: string[], windowSeconds: number): Promise<Record<string, number>>;
}

/** O que cada espectador recebe a cada batimento: iguais para todos. */
export type LivePulseView = { viewers: number; likes: number; reactions: ReactionTotals };
export const EMPTY_PULSE: LivePulseView = { viewers: 0, likes: 0, reactions: NO_REACTIONS };

type ReactionReader = Pick<LiveReactionStore, "likes"> & { reactionTotals(streamId: string): Promise<ReactionTotals> };

/**
 * #191 — Batimento da aba que está assistindo: conta o espectador e devolve os contadores do momento
 * (espectadores, curtidas e reações). Público: visitante também conta. Fora do ar, ou sem o recurso no plano,
 * nada é registrado e tudo vem zerado.
 */
export class LivePulse {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly presence: Pick<PresenceStore, "beat">,
    private readonly reactions: ReactionReader,
    private readonly entitled: ChatEntitlement,
  ) {}

  async execute(input: { streamId: string; viewerId: string }): Promise<Result<LivePulseView, DomainError>> {
    const room = await this.rooms.room(input.streamId);
    if (!room || room.status !== "live" || !(await this.entitled(room.ownerId))) return ok(EMPTY_PULSE);
    const [viewers, likes, reactions] = await Promise.all([
      this.presence.beat(room.streamId, input.viewerId, PRESENCE_WINDOW_SECONDS),
      this.reactions.likes(room.streamId),
      this.reactions.reactionTotals(room.streamId),
    ]);
    return ok({ viewers, likes, reactions });
  }
}
