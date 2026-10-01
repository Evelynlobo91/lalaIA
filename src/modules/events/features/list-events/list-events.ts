import { z } from "zod";
import { categories, type CategoryId } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { formatDateTime, formatTime, sameLocalDay } from "@/shared/time/joinville-time";
import { formatPrice } from "../../domain/event";
import { dateFilterParam, dateWindow } from "../../domain/date-window";
import type { EventCursor, EventPlaceNames, EventReader } from "../../domain/event-card";

export const DEFAULT_PAGE_SIZE = 20;

const cursorPayload = z.object({ s: z.iso.datetime(), id: z.uuid() });

export function encodeEventCursor(c: EventCursor): string {
  return Buffer.from(JSON.stringify({ s: c.startsAt.toISOString(), id: c.id }), "utf8").toString("base64url");
}

export function decodeEventCursor(value: string): EventCursor | null {
  try {
    const parsed = cursorPayload.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? { startsAt: new Date(parsed.data.s), id: parsed.data.id } : null;
  } catch {
    return null;
  }
}

export const listEventsSchema = z.object({
  cursor: z
    .string()
    .max(400)
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const cursor = decodeEventCursor(value);
      if (!cursor) {
        ctx.addIssue({ code: "custom", message: "Cursor inválido." });
        return z.NEVER;
      }
      return cursor;
    }),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  quando: dateFilterParam,
});

export type ListEventsInput = z.infer<typeof listEventsSchema>;

export type EventListItem = {
  id: string;
  title: string;
  category: CategoryId;
  categoryLabel: string;
  placeName: string;
  neighborhood: string | null;
  /** "sáb., 10 de out., 20:00 – 23:30" */
  whenLabel: string;
  priceLabel: string;
  happeningNow: boolean;
  startsAt: string;
};

export type EventListPage = { items: EventListItem[]; nextCursor: string | null };

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** "sáb., 10 de out., 20:00 – 23:30" (ou com a data final, se terminar em outro dia). */
export function whenLabel(startsAt: Date, endsAt: Date): string {
  return `${formatDateTime(startsAt)} – ${sameLocalDay(startsAt, endsAt) ? formatTime(endsAt) : formatDateTime(endsAt)}`;
}

/** RF13/RF17 — Eventos que estão acontecendo ou vão acontecer em Joinville. */
export class ListEvents {
  constructor(
    private readonly reader: EventReader,
    private readonly places: EventPlaceNames,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ListEventsInput): Promise<Result<EventListPage, DomainError>> {
    const now = this.now();
    const window = input.quando ? dateWindow(input.quando, now) : undefined;
    const rows = await this.reader.listUpcoming({ now, cursor: input.cursor, limit: input.limit + 1, ...(window && { window }) });
    const page = rows.slice(0, input.limit);
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
      nextCursor: rows.length > input.limit && last ? encodeEventCursor({ startsAt: last.startsAt, id: last.id }) : null,
    });
  }
}
