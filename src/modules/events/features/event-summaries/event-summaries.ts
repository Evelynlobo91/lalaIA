import { categories, type CategoryId } from "@/shared/catalog/categories";
import type { EventStatus } from "../../domain/event";
import type { EventPlaceNames, EventSummaryReader } from "../../domain/event-card";
import { whenLabel } from "../list-events/list-events";

/** Resumo de um evento para outros módulos (ex.: favoritos), em qualquer situação. */
export type EventSummary = {
  id: string;
  title: string;
  category: CategoryId;
  categoryLabel: string;
  placeId: string;
  placeName: string;
  neighborhood: string | null;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  /** "sáb., 10 de out., 20:00 – 23:30" */
  whenLabel: string;
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** Vários eventos por id, com o nome do lugar: duas consultas no total, qualquer que seja a quantidade. */
export class GetEventSummaries {
  constructor(
    private readonly reader: EventSummaryReader,
    private readonly places: EventPlaceNames,
  ) {}

  async execute(ids: string[]): Promise<EventSummary[]> {
    if (ids.length === 0) return [];
    const events = await this.reader.findByIds([...new Set(ids)]);
    const places = new Map((await this.places.summaries([...new Set(events.map((e) => e.placeId))])).map((p) => [p.id, p]));
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      categoryLabel: labels.get(e.category) ?? e.category,
      placeId: e.placeId,
      placeName: places.get(e.placeId)?.name ?? "Local a confirmar",
      neighborhood: places.get(e.placeId)?.neighborhood ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: e.status,
      whenLabel: whenLabel(e.startsAt, e.endsAt),
    }));
  }
}
