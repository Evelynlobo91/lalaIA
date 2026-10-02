import { categories, type CategoryId } from "@/shared/catalog/categories";
import { err, ok, ValidationError, type DomainError, type Result } from "@/shared/kernel";
import { formatPrice } from "../../domain/event";
import type { EventCard, EventCursor, EventPlaceNames } from "../../domain/event-card";
import { decodeEventCursor, encodeEventCursor, whenLabel, type EventListPage } from "../list-events/list-events";

/** O que a busca pede ao banco. Sempre só eventos agendados que ainda não terminaram em `now`. */
export type EventSearchFilter = {
  now: Date;
  /** Texto livre: casa com título/descrição (sem acento, por prefixo) ou com o nome da categoria. */
  text: string | null;
} & EventSearchRestrictions;

/** Filtros opcionais da busca (RF05). Ausente = sem restrição; lista vazia = nada casa. */
export type EventSearchRestrictions = {
  category?: CategoryId;
  /** Só eventos nestes lugares (ex.: lugares de um bairro, vindos do módulo places). */
  placeIds?: string[];
  /** Só eventos que se sobrepõem a algum destes períodos. */
  periods?: Array<{ from: Date; to: Date }>;
  /** Faixa de preço "a partir de", em centavos (`maxCents` null = sem teto). */
  price?: { minCents: number; maxCents: number | null };
};

export interface EventSearchReader {
  /** Eventos que atendem ao filtro, por início (keyset em starts_at, id) depois do cursor. */
  search(filter: EventSearchFilter, cursor: EventCursor | null, limit: number): Promise<EventCard[]>;
}

/** Critérios públicos da busca de eventos (usados pelo módulo discovery). */
export type EventSearchCriteria = EventSearchRestrictions & {
  text?: string | null;
  /** Cursor opaco devolvido pela página anterior. */
  cursor: string | null;
  limit: number;
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** RF04 — Busca de eventos que estão acontecendo ou vão acontecer, por início. */
export class SearchEvents {
  constructor(
    private readonly reader: EventSearchReader,
    private readonly places: EventPlaceNames,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(criteria: EventSearchCriteria): Promise<Result<EventListPage, DomainError>> {
    const cursor = criteria.cursor ? decodeEventCursor(criteria.cursor) : null;
    if (criteria.cursor && !cursor) return err(new ValidationError("Cursor inválido."));

    const now = this.now();
    const { category, placeIds, periods, price } = criteria;
    const filter: EventSearchFilter = {
      now,
      text: criteria.text?.trim() || null,
      ...(category && { category }),
      ...(placeIds && { placeIds }),
      ...(periods && { periods }),
      ...(price && { price }),
    };
    const rows = await this.reader.search(filter, cursor, criteria.limit + 1);
    const page = rows.slice(0, criteria.limit);
    const places = new Map((await this.places.summaries(page.map((e) => e.placeId))).map((p) => [p.id, p]));
    const last = page.at(-1);

    return ok({
      items: page.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        categoryLabel: labels.get(e.category) ?? e.category,
        placeName: places.get(e.placeId)?.name ?? "Local a confirmar",
        neighborhood: places.get(e.placeId)?.neighborhood ?? null,
        whenLabel: whenLabel(e.startsAt, e.endsAt),
        priceLabel: formatPrice(e.priceCents),
        happeningNow: e.startsAt <= now && now < e.endsAt,
        startsAt: e.startsAt.toISOString(),
      })),
      nextCursor: rows.length > criteria.limit && last ? encodeEventCursor({ startsAt: last.startsAt, id: last.id }) : null,
    });
  }
}
