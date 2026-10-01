// Missões surpresa (#63, RF35): oferecidas a quem está perto, com validade curta; aceitar ou ignorar.
// Depois do aceite, as etapas se revelam uma por vez. Regras puras.
import type { MissionStep } from "./mission";
import type { UserMission } from "./user-mission";

/** Quanto tempo a oferta vale (nunca passa do fim da missão). */
export const SURPRISE_OFFER_MINUTES = 30;
/** Gatilho por proximidade: o lugar da primeira etapa a até 1 km de quem está procurando. */
export const SURPRISE_RADIUS_METERS = 1000;
/** Gatilho por horário: só oferece se ainda houver pelo menos 1 hora de missão depois de aceitar. */
export const SURPRISE_MIN_REMAINING_MINUTES = 60;

export type SurpriseOfferStatus = "offered" | "accepted" | "dismissed";

export type SurpriseOffer = {
  id: string;
  userId: string;
  missionId: string;
  offeredAt: Date;
  expiresAt: Date;
  status: SurpriseOfferStatus;
};

export const isOpen = (offer: Pick<SurpriseOffer, "status" | "expiresAt">, now: Date) => offer.status === "offered" && offer.expiresAt > now;

/** Validade da oferta: curta e nunca depois do fim da missão. */
export function offerExpiry(now: Date, missionEndsAt: Date): Date {
  return new Date(Math.min(now.getTime() + SURPRISE_OFFER_MINUTES * 60_000, missionEndsAt.getTime()));
}

/** A missão ainda vale tempo suficiente para ser oferecida agora? */
export const worthOffering = (missionEndsAt: Date, now: Date) => missionEndsAt.getTime() - now.getTime() >= SURPRISE_MIN_REMAINING_MINUTES * 60_000;

/**
 * Etapas visíveis de uma missão surpresa: nenhuma antes do aceite; depois, as concluídas e a próxima.
 * As seguintes continuam escondidas até chegar a vez delas.
 */
export function revealedStepIds(steps: Pick<MissionStep, "id" | "position">[], userMission: Pick<UserMission, "status"> | null, doneIds: Set<string>): Set<string> {
  if (!userMission) return new Set();
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  if (userMission.status === "completed") return new Set(ordered.map((s) => s.id));
  const next = ordered.find((s) => !doneIds.has(s.id));
  return new Set([...ordered.filter((s) => doneIds.has(s.id)).map((s) => s.id), ...(next ? [next.id] : [])]);
}

/** Ofertas de missão surpresa da pessoa. Tudo roda como ela (asUser + RLS). */
export interface SurpriseOfferRepository {
  /** Ofertas em aberto (não respondidas e não expiradas), da que expira antes para a que expira depois. */
  listOpen(userId: string, now: Date): Promise<SurpriseOffer[]>;
  find(userId: string, missionId: string): Promise<SurpriseOffer | null>;
  /** Ids das missões já oferecidas (em qualquer status): uma oferta por pessoa e missão. */
  offeredMissionIds(userId: string): Promise<Set<string>>;
  /** Idempotente: se já existe oferta para a missão, devolve a existente. */
  create(userId: string, missionId: string, expiresAt: Date): Promise<SurpriseOffer>;
  /** Na mesma transação: cria o aceite (RLS exige a oferta aberta) e marca a oferta como aceita. */
  accept(userId: string, missionId: string): Promise<UserMission>;
  dismiss(userId: string, missionId: string): Promise<void>;
}
