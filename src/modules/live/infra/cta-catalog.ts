import { eventsByOwner } from "@/modules/events";
import { missionsByOwner } from "@/modules/missions";
import { offersCreatedBy } from "@/modules/partners";
import type { LiveTargetDirectory, StreamTarget } from "../domain/stream";
import type { CtaCatalog } from "../features/schedule-cta/cta-types";

/**
 * O que o parceiro pode chamar num CTA, pelas APIs públicas de partners, missions e events (sem tocar nas
 * tabelas deles). Só o que é dele e ainda está valendo.
 */
export class ModuleCtaCatalog implements CtaCatalog {
  constructor(
    private readonly directory: LiveTargetDirectory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async offers(ownerId: string) {
    const offers = await offersCreatedBy(ownerId);
    return offers
      .filter((o) => o.availability === "available" || o.availability === "upcoming")
      .map((o) => ({ id: o.id, label: `${o.title} · ${o.targetName}`, href: `${o.target.type === "place" ? "/lugares" : "/eventos"}/${o.target.id}` }));
  }

  async missions(ownerId: string) {
    const now = this.now();
    return (await missionsByOwner(ownerId)).filter((m) => m.status === "active" && m.endsAt > now).map((m) => ({ id: m.id, label: m.title }));
  }

  async events(ownerId: string) {
    const now = this.now();
    return (await eventsByOwner(ownerId)).filter((e) => e.status === "scheduled" && e.endsAt > now).map((e) => ({ id: e.id, label: `${e.title} · ${e.placeName}` }));
  }

  async directions(target: StreamTarget): Promise<string | null> {
    const [info] = await this.directory.describe([target]);
    if (!info?.location) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${info.location.lat.toFixed(6)},${info.location.lon.toFixed(6)}`;
  }
}
