import { editableEvent, eventsByOwner } from "@/modules/events";
import { placesManagedBy } from "@/modules/places";
import type { StreamTargets } from "../domain/stream";

/**
 * Posse de lugar/evento pelas APIs públicas de places e events (sem tocar nas tabelas deles).
 * Evento: só do próprio organizador, não cancelado e ainda não terminado.
 */
export class ModuleStreamTargets implements StreamTargets {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async owns(userId: string, { entityType, entityId }: { entityType: "place" | "event"; entityId: string }): Promise<boolean> {
    if (entityType === "place") return (await placesManagedBy(userId)).some((p) => p.id === entityId);
    const editable = await editableEvent({ id: userId, isAdmin: false }, entityId);
    return Boolean(editable && editable.event.ownerId === userId && editable.event.endsAt > this.now());
  }

  async optionsFor(userId: string) {
    const [places, events] = await Promise.all([placesManagedBy(userId), eventsByOwner(userId)]);
    const now = this.now();
    return [
      ...places.map((p) => ({ entityType: "place" as const, entityId: p.id, label: p.neighborhood ? `${p.name} · ${p.neighborhood}` : p.name, href: `/lugares/${p.id}` })),
      ...events
        .filter((e) => e.status === "scheduled" && e.endsAt > now)
        .map((e) => ({ entityType: "event" as const, entityId: e.id, label: `${e.title} · ${e.placeName}`, href: `/eventos/${e.id}` })),
    ];
  }
}
