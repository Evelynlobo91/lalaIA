import { eventSummaries, eventsByOwner } from "@/modules/events";
import { placeSummaries, placesManagedBy } from "@/modules/places";
import { targetKey, type OfferTarget, type OfferTargets } from "../domain/offer";

/**
 * Adaptador: posse e nomes de lugares/eventos pelas APIs públicas de places e events
 * (sem consultar os schemas deles). Eventos cancelados ou que já terminaram não recebem ofertas novas.
 */
export function offerTargets(now: () => Date = () => new Date()): OfferTargets {
  return {
    async ownedBy(userId) {
      const [places, events] = await Promise.all([placesManagedBy(userId), eventsByOwner(userId)]);
      const current = now();
      return [
        ...places.map((p) => ({ type: "place" as const, id: p.id, name: p.name })),
        ...events.filter((e) => e.status === "scheduled" && e.endsAt > current).map((e) => ({ type: "event" as const, id: e.id, name: e.title })),
      ];
    },

    async names(targets: OfferTarget[]) {
      const ids = (type: OfferTarget["type"]) => [...new Set(targets.filter((t) => t.type === type).map((t) => t.id))];
      const placeIds = ids("place");
      const eventIds = ids("event");
      const [places, events] = await Promise.all([placeIds.length ? placeSummaries(placeIds) : [], eventIds.length ? eventSummaries(eventIds) : []]);
      return new Map<string, string>([
        ...places.map((p) => [targetKey({ type: "place", id: p.id }), p.name] as [string, string]),
        ...events.map((e) => [targetKey({ type: "event", id: e.id }), e.title] as [string, string]),
      ]);
    },
  };
}
