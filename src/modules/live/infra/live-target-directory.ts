import { eventSummaries } from "@/modules/events";
import { placePoints, placeSummaries } from "@/modules/places";
import type { LiveTargetDirectory, LiveTargetInfo, StreamTarget } from "../domain/stream";

/**
 * Nome, lugar, horário, link e coordenadas de lugares/eventos ao vivo, pelas APIs públicas de places e
 * events (sem tocar nas tabelas deles). No máximo quatro consultas, qualquer que seja a quantidade.
 * Lugar/evento que não existe mais fica de fora.
 */
export class ModuleLiveTargetDirectory implements LiveTargetDirectory {
  async describe(targets: StreamTarget[]): Promise<LiveTargetInfo[]> {
    const placeIds = targets.filter((t) => t.entityType === "place").map((t) => t.entityId);
    const eventIds = targets.filter((t) => t.entityType === "event").map((t) => t.entityId);

    const events = eventIds.length > 0 ? await eventSummaries(eventIds) : [];
    const [places, points] = await Promise.all([
      placeIds.length > 0 ? placeSummaries(placeIds) : Promise.resolve([]),
      placePoints([...placeIds, ...events.map((e) => e.placeId)]),
    ]);
    const pointById = new Map(points.map((p) => [p.id, { lat: p.lat, lon: p.lon }]));
    const placeById = new Map(places.map((p) => [p.id, p]));
    const eventById = new Map(events.map((e) => [e.id, e]));

    return targets.flatMap((t): LiveTargetInfo[] => {
      if (t.entityType === "place") {
        const place = placeById.get(t.entityId);
        if (!place) return [];
        return [{ ...t, title: place.name, subtitle: place.neighborhood, whenLabel: null, href: `/lugares/${place.id}`, location: pointById.get(place.id) ?? null }];
      }
      const event = eventById.get(t.entityId);
      if (!event) return [];
      const subtitle = event.neighborhood ? `${event.placeName} · ${event.neighborhood}` : event.placeName;
      return [{ ...t, title: event.title, subtitle, whenLabel: event.whenLabel, href: `/eventos/${event.id}`, location: pointById.get(event.placeId) ?? null }];
    });
  }
}
