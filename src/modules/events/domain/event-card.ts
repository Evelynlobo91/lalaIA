import type { CategoryId } from "@/shared/catalog/categories";
import type { EventStatus } from "./event";

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
  /** Só eventos que se sobrepõem a este período (filtro de data, RF15). */
  window?: { from: Date; to: Date };
  /** Só estas categorias (RF16). Vazio ou ausente = todas. */
  categories?: CategoryId[];
};

export interface EventReader {
  /** Eventos agendados que ainda não terminaram, por início. Pede `limit + 1` para saber se há mais. */
  listUpcoming(query: EventQuery): Promise<EventCard[]>;
}

/** Evento por id em qualquer situação (inclusive terminado ou cancelado), para outros módulos. */
export type EventSummaryRow = EventCard & { status: EventStatus };

export interface EventSummaryReader {
  /** Vários eventos numa consulta só (evita N+1). Ids inexistentes são ignorados. */
  findByIds(ids: string[]): Promise<EventSummaryRow[]>;
}

/** Porta para nome/bairro dos lugares (API pública do módulo places), numa consulta só. */
export interface EventPlaceNames {
  summaries(ids: string[]): Promise<Array<{ id: string; name: string; neighborhood: string | null }>>;
}
