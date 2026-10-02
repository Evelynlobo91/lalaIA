import type { LiveActor, StreamRepository } from "../../domain/stream";
import { METRICS_RECENT_DAYS, interactionTotalsSchema } from "./stream-metrics.schema";

type Totals = Record<string, Partial<Record<string, number>>>;

/**
 * Porta para as contagens do Analytics (implementada pela API pública dele). Só contagens por entidade:
 * o Analytics não guarda quem fez (LGPD).
 */
export interface InteractionCounter {
  totals(entityType: "live" | "place" | "event", entityIds: string[], since?: Date): Promise<Totals>;
}

export type Count = { total: number; recent: number };

/**
 * Métricas de uma transmissão (RF25):
 * - `watched`: quantas vezes alguém começou a assistir (`live_view`, uma vez por aba);
 * - `pageViews`: acessos à página do lugar/evento (`view`), onde fica o player.
 */
export type StreamMetrics = { watched: Count; pageViews: Count };

/** RF25 — Métricas das transmissões do parceiro, para o portal (só as dele). Seis consultas agregadas, em paralelo. */
export class GetStreamMetrics {
  constructor(
    private readonly streams: Pick<StreamRepository, "listByOwner">,
    private readonly counter: InteractionCounter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: LiveActor): Promise<Record<string, StreamMetrics>> {
    const mine = await this.streams.listByOwner(actor.id);
    if (mine.length === 0) return {};
    const since = new Date(this.now().getTime() - METRICS_RECENT_DAYS * 24 * 60 * 60 * 1000);
    const ids = (type: "place" | "event") => mine.filter((s) => s.entityType === type).map((s) => s.entityId);
    const count = async (type: "live" | "place" | "event", entityIds: string[], from?: Date): Promise<Totals> =>
      entityIds.length === 0 ? {} : interactionTotalsSchema.parse(await this.counter.totals(type, entityIds, from));

    const streamIds = mine.map((s) => s.id);
    const [watched, watchedRecent, places, placesRecent, events, eventsRecent] = await Promise.all([
      count("live", streamIds),
      count("live", streamIds, since),
      count("place", ids("place")),
      count("place", ids("place"), since),
      count("event", ids("event")),
      count("event", ids("event"), since),
    ]);

    const metrics: Record<string, StreamMetrics> = {};
    for (const s of mine) {
      const [pages, pagesRecent] = s.entityType === "place" ? [places, placesRecent] : [events, eventsRecent];
      metrics[s.id] = {
        watched: { total: watched[s.id]?.live_view ?? 0, recent: watchedRecent[s.id]?.live_view ?? 0 },
        pageViews: { total: pages[s.entityId]?.view ?? 0, recent: pagesRecent[s.entityId]?.view ?? 0 },
      };
    }
    return metrics;
  }
}
