// Descontos e promoções do parceiro (#30): ofertas num lugar que ele gerencia ou num evento que criou.

export const offerTargetTypes = ["place", "event"] as const;
export type OfferTargetType = (typeof offerTargetTypes)[number];
export type OfferTarget = { type: OfferTargetType; id: string };

export type OfferStatus = "active" | "ended";

export const MAX_OFFER_REDEMPTIONS = 100_000;

export type OfferDraft = {
  target: OfferTarget;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  /** Limite total de resgates; null = sem limite. Cada pessoa resgata uma vez só. */
  maxRedemptions: number | null;
};

export type Offer = OfferDraft & {
  id: string;
  partnerId: string;
  status: OfferStatus;
  redeemedCount: number;
  createdAt: Date;
};

/** Situação da oferta para quem vê a página do lugar/evento. */
export type OfferAvailability = "available" | "upcoming" | "expired" | "sold_out" | "ended";

export function availabilityOf(offer: Pick<Offer, "status" | "startsAt" | "endsAt" | "maxRedemptions" | "redeemedCount">, now: Date): OfferAvailability {
  if (offer.status === "ended") return "ended";
  if (now >= offer.endsAt) return "expired";
  if (now < offer.startsAt) return "upcoming";
  if (offer.maxRedemptions !== null && offer.redeemedCount >= offer.maxRedemptions) return "sold_out";
  return "available";
}

/** Resgates restantes (null = sem limite). */
export function remainingOf(offer: Pick<Offer, "maxRedemptions" | "redeemedCount">): number | null {
  return offer.maxRedemptions === null ? null : Math.max(0, offer.maxRedemptions - offer.redeemedCount);
}

export type Redemption = {
  id: string;
  offerId: string;
  userId: string;
  code: string;
  redeemedAt: Date;
  validatedAt: Date | null;
};

/** Resultado de gravar um resgate. `created: false` = a pessoa já tinha resgatado (idempotente). */
export type RedeemOutcome = { kind: "redeemed"; redemption: Redemption; created: boolean } | { kind: "sold_out" } | { kind: "unavailable" } | { kind: "code_taken" };

/** Resgate encontrado pelo código, já restrito às ofertas do parceiro. */
export type RedemptionForValidation = Redemption & { offer: Offer };

export interface OfferRepository {
  findById(id: string): Promise<Offer | null>;
  /** Ofertas ativas de um lugar/evento que ainda não terminaram (inclui as que vão começar e as esgotadas). */
  listCurrentFor(target: OfferTarget, now: Date): Promise<Offer[]>;
  listByPartner(partnerId: string): Promise<Array<Offer & { validatedCount: number }>>;
  /** Escritas como o usuário (asUser): a RLS confere o dono no banco. */
  create(actorId: string, partnerId: string, draft: OfferDraft): Promise<Offer>;
  update(actorId: string, id: string, draft: OfferDraft): Promise<Offer | null>;
  end(actorId: string, id: string): Promise<Offer | null>;
}

export interface RedemptionRepository {
  findMine(userId: string, offerId: string): Promise<Redemption | null>;
  /** Resgates da pessoa nas ofertas dadas (para mostrar o código já resgatado na página). */
  findMineFor(userId: string, offerIds: string[]): Promise<Redemption[]>;
  listMine(userId: string): Promise<Array<Redemption & { offer: Offer }>>;
  /** Insere como o usuário; o banco garante 1 por pessoa (unique) e o limite total (trigger com lock). */
  redeem(userId: string, offerId: string, code: string): Promise<RedeemOutcome>;
  /** Busca pelo código só entre as ofertas do parceiro (RLS + filtro explícito). */
  findForPartner(actorId: string, partnerId: string, code: string): Promise<RedemptionForValidation | null>;
  /** Marca como validado se ainda não foi (uma vez só). null = alguém validou antes. */
  markValidated(actorId: string, redemptionId: string): Promise<Redemption | null>;
}

/** Porta: o lugar/evento é do parceiro? (APIs públicas de places e events) */
export interface OfferTargets {
  /** Lugares que gerencia e eventos agendados que criou e ainda não terminaram. */
  ownedBy(userId: string): Promise<Array<OfferTarget & { name: string }>>;
  /** Nomes dos alvos (qualquer dono), para listas. */
  names(targets: OfferTarget[]): Promise<Map<string, string>>;
}

export const targetKey = (t: OfferTarget) => `${t.type}:${t.id}`;
