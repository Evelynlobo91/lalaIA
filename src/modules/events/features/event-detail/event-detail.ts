import { z } from "zod";
import { categories } from "@/shared/catalog/categories";
import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import { formatPrice, type EventRepository } from "../../domain/event";
import { whenLabel } from "../list-events/list-events";

export type EventPhase = "upcoming" | "happening" | "finished" | "cancelled";

/** Dados do lugar para a página do evento (API pública do módulo places). */
export interface EventPlaceDetails {
  detail(placeId: string): Promise<{ id: string; name: string; address: string | null; directionsUrl: string } | null>;
}

export type EventDetailView = {
  id: string;
  title: string;
  description: string;
  categoryLabel: string;
  whenLabel: string;
  priceLabel: string;
  phase: EventPhase;
  startsAt: string;
  place: { id: string; name: string; address: string | null; directionsUrl: string } | null;
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

export function phaseOf(status: "scheduled" | "cancelled", startsAt: Date, endsAt: Date, now: Date): EventPhase {
  if (status === "cancelled") return "cancelled";
  if (endsAt <= now) return "finished";
  return startsAt <= now ? "happening" : "upcoming";
}

/** RF06/RF14 — Detalhe do evento. Cancelados e encerrados continuam acessíveis (links já compartilhados). */
export class GetEventDetail {
  constructor(
    private readonly events: Pick<EventRepository, "findById">,
    private readonly places: EventPlaceDetails,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(id: string): Promise<Result<EventDetailView, NotFoundError>> {
    if (!z.uuid().safeParse(id).success) return err(new NotFoundError("Evento"));
    const event = await this.events.findById(id);
    if (!event) return err(new NotFoundError("Evento"));
    return ok({
      id: event.id,
      title: event.title,
      description: event.description,
      categoryLabel: labels.get(event.category) ?? event.category,
      whenLabel: whenLabel(event.startsAt, event.endsAt),
      priceLabel: formatPrice(event.priceCents),
      phase: phaseOf(event.status, event.startsAt, event.endsAt, this.now()),
      startsAt: event.startsAt.toISOString(),
      place: await this.places.detail(event.placeId),
    });
  }
}
