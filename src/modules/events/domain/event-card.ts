import type { CategoryId } from "@/shared/catalog/categories";

/** Resumo para listas públicas. */
export type EventCard = {
  id: string;
  title: string;
  category: CategoryId;
  placeId: string;
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
};

/** Posição na lista ordenada por início (paginação por cursor). */
export type EventCursor = { startsAt: Date; id: string };

/**
 * Filtros da listagem pública. Novos filtros (data, categoria...) entram como campos opcionais
 * aqui, sem mudar quem já usa (OCP).
 */
export type EventQuery = {
  /** "Agora": eventos que ainda não terminaram nesse instante. */
  now: Date;
  cursor: EventCursor | null;
  limit: number;
};

export interface EventReader {
  /** Eventos agendados que ainda não terminaram, por início. Pede `limit + 1` para saber se há mais. */
  listUpcoming(query: EventQuery): Promise<EventCard[]>;
}

/** Porta para nome/bairro dos lugares (API pública do módulo places), numa consulta só. */
export interface EventPlaceNames {
  summaries(ids: string[]): Promise<Array<{ id: string; name: string; neighborhood: string | null }>>;
}
