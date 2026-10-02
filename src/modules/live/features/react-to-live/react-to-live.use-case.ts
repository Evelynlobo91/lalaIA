import { z } from "zod";
import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { ChatEntitlement, ChatRoomReader } from "../send-chat-message/send-chat-message.use-case";

/** Reações rápidas que flutuam sobre o player. Tipo novo = uma linha aqui (e no check da tabela). */
export const REACTIONS = {
  heart: "❤️",
  fire: "🔥",
  laugh: "😂",
  clap: "👏",
  cheers: "🍻",
} as const;
export type ReactionKind = keyof typeof REACTIONS;
export const REACTION_KINDS = Object.keys(REACTIONS) as ReactionKind[];
export const REACTION_LABELS: Record<ReactionKind, string> = { heart: "Amei", fire: "Pegando fogo", laugh: "Risada", clap: "Palmas", cheers: "Brinde" };

export const REACTION_LIMITS = {
  /** A tela junta os toques e envia um lote a cada tanto (ms), para não sobrecarregar. */
  batchMs: 2_000,
  /** Reações de um mesmo tipo aceitas por lote (o excesso é descartado). */
  perKind: 10,
  /** Intervalo mínimo entre lotes da mesma pessoa (ms), conferido no servidor. */
  minIntervalMs: 1_000,
} as const;

export type ReactionTotals = Record<ReactionKind, number>;
export const NO_REACTIONS: ReactionTotals = { heart: 0, fire: 0, laugh: 0, clap: 0, cheers: 0 };

const count = z.number().int().min(0).max(1000);
export const sendReactionsSchema = z.object({
  streamId: z.uuid(),
  counts: z.object({ heart: count, fire: count, laugh: count, clap: count, cheers: count }).partial(),
});
export const toggleLikeSchema = z.object({ streamId: z.uuid() });

/** Curtidas da live (uma por pessoa) e contadores de reação (agregados, sem quem reagiu). */
export interface LiveReactionStore {
  /** Alterna a curtida como o usuário (RLS: só com a live no ar). null se o banco recusar. */
  toggleLike(userId: string, streamId: string): Promise<{ liked: boolean } | null>;
  likes(streamId: string): Promise<number>;
  /** Soma o lote aos contadores (sistema) e devolve os totais. */
  addReactions(streamId: string, counts: Partial<ReactionTotals>): Promise<ReactionTotals>;
}

/** Intervalo mínimo entre ações da mesma pessoa. Em memória no início; Redis se escalar (#56). */
export interface RateLimiter {
  /** true = pode agir agora (e a ação fica registrada). */
  allow(key: string, minIntervalMs: number): boolean;
}

/** Limite em memória do processo: suficiente para uma instância; atrás da porta para trocar depois. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly last = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  allow(key: string, minIntervalMs: number): boolean {
    const now = this.now();
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < minIntervalMs) return false;
    this.last.set(key, now);
    if (this.last.size > 5_000) for (const [k, at] of this.last) if (now - at > 60_000) this.last.delete(k);
    return true;
  }
}

const closed = () => err(new BusinessRuleError("live_closed", "Só dá para reagir com a live no ar."));

async function openRoom(rooms: ChatRoomReader, entitled: ChatEntitlement, streamId: string): Promise<Result<{ streamId: string }, DomainError>> {
  const room = await rooms.room(streamId);
  if (!room) return err(new NotFoundError("Transmissão"));
  // Curtidas e reações valem mesmo com o chat desligado pelo anfitrião; dependem só da live no ar e do plano.
  if (room.status !== "live" || !(await entitled(room.ownerId))) return closed();
  return ok({ streamId: room.streamId });
}

/** #189 — Curtir a live (alterna). Uma curtida por pessoa; o contador é o mesmo para todos. */
export class ToggleLiveLike {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly reactions: Pick<LiveReactionStore, "toggleLike" | "likes">,
    private readonly entitled: ChatEntitlement,
  ) {}

  async execute(user: { id: string }, streamId: string): Promise<Result<{ liked: boolean; likes: number }, DomainError>> {
    const room = await openRoom(this.rooms, this.entitled, streamId);
    if (!room.ok) return room;
    const toggled = await this.reactions.toggleLike(user.id, streamId);
    if (!toggled) return closed();
    return ok({ liked: toggled.liked, likes: await this.reactions.likes(streamId) });
  }
}

/**
 * #189 — Reações rápidas. A tela agrupa os toques e manda um lote; o servidor limita o lote (por tipo) e o
 * intervalo entre lotes da mesma pessoa, e soma aos contadores. Nada é guardado por pessoa.
 */
export class SendReactions {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly reactions: Pick<LiveReactionStore, "addReactions">,
    private readonly entitled: ChatEntitlement,
    private readonly limiter: RateLimiter,
  ) {}

  async execute(user: { id: string }, streamId: string, counts: Partial<Record<ReactionKind, number>>): Promise<Result<{ reactions: ReactionTotals }, DomainError>> {
    const room = await openRoom(this.rooms, this.entitled, streamId);
    if (!room.ok) return room;
    const capped: Partial<ReactionTotals> = {};
    for (const kind of REACTION_KINDS) {
      const n = Math.min(counts[kind] ?? 0, REACTION_LIMITS.perKind);
      if (n > 0) capped[kind] = n;
    }
    if (Object.keys(capped).length === 0) return err(new BusinessRuleError("no_reactions", "Nenhuma reação para enviar."));
    if (!this.limiter.allow(`reactions:${streamId}:${user.id}`, REACTION_LIMITS.minIntervalMs)) {
      return err(new BusinessRuleError("rate_limited", "Calma: reações demais em pouco tempo."));
    }
    return ok({ reactions: await this.reactions.addReactions(streamId, capped) });
  }
}
