import type { CategoryId } from "@/shared/catalog/categories";

export type EventStatus = "scheduled" | "cancelled";

export type EventDraft = {
  placeId: string;
  title: string;
  description: string;
  category: CategoryId;
  startsAt: Date;
  endsAt: Date;
  /** "A partir de", em centavos. 0 = gratuito. */
  priceCents: number;
};

export type EventRecord = EventDraft & {
  id: string;
  ownerId: string;
  status: EventStatus;
  createdAt: Date;
};

export interface EventRepository {
  findById(id: string): Promise<EventRecord | null>;
  listByOwner(ownerId: string): Promise<EventRecord[]>;
  /** Escritas rodam como o usuário (asUser): RLS garante dono/papel no banco. */
  create(actorId: string, draft: EventDraft): Promise<EventRecord>;
  update(actorId: string, id: string, draft: EventDraft): Promise<EventRecord | null>;
  cancel(actorId: string, id: string): Promise<EventRecord | null>;
}

/** Porta para validar o lugar (implementada pela API pública do módulo places). */
export interface EventPlaceLookup {
  summary(placeId: string): Promise<{ id: string; name: string; neighborhood: string | null } | null>;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "Grátis" ou "A partir de R$ 25,00". */
export function formatPrice(priceCents: number): string {
  return priceCents === 0 ? "Grátis" : `A partir de ${brl.format(priceCents / 100)}`;
}
