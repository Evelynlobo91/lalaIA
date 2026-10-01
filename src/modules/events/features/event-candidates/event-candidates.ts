import type { CategoryId } from "@/shared/catalog/categories";
import type { EventCard, EventPlaceNames } from "../../domain/event-card";

/** Evento agendado com a data de publicação (para o sinal de "novidade" da Recomendação). */
export type EventCandidateRow = EventCard & { createdAt: Date };

export interface EventCandidateReader {
  /** Agendados (não cancelados) que se sobrepõem a [from, to), por início. */
  listOverlapping(from: Date, to: Date, limit: number): Promise<EventCandidateRow[]>;
}

/** Evento que pode virar sugestão (API pública para a Recomendação). */
export type EventCandidate = {
  id: string;
  title: string;
  category: CategoryId;
  placeId: string;
  placeName: string;
  neighborhood: string | null;
  startsAt: Date;
  endsAt: Date;
  /** "A partir de", em centavos, por pessoa. 0 = grátis. */
  priceCents: number;
  publishedAt: Date;
};

export type EventCandidatesQuery = { from: Date; to: Date; limit: number };

export const MAX_EVENT_CANDIDATES = 100;

/** Eventos que acontecem em algum momento do período, com o nome do lugar (duas consultas no total). */
export class FindEventCandidates {
  constructor(
    private readonly reader: EventCandidateReader,
    private readonly places: EventPlaceNames,
  ) {}

  async execute(query: EventCandidatesQuery): Promise<EventCandidate[]> {
    if (query.to.getTime() <= query.from.getTime()) return [];
    const limit = Math.min(Math.max(1, Math.floor(query.limit)), MAX_EVENT_CANDIDATES);
    const rows = await this.reader.listOverlapping(query.from, query.to, limit);
    if (rows.length === 0) return [];
    const places = new Map((await this.places.summaries([...new Set(rows.map((e) => e.placeId))])).map((p) => [p.id, p]));
    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      placeId: e.placeId,
      placeName: places.get(e.placeId)?.name ?? "Local a confirmar",
      neighborhood: places.get(e.placeId)?.neighborhood ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      priceCents: e.priceCents,
      publishedAt: e.createdAt,
    }));
  }
}
