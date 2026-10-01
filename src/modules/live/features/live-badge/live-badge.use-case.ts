import { ok, type DomainError, type Result } from "@/shared/kernel";
import { targetKey, type LiveTargetDirectory, type PublicStreamReader, type StreamEntityType } from "../../domain/stream";
import type { ListActiveStreams } from "../player/player.use-case";
import { LIVE_NOW_MAX } from "./live-badge.schema";

/** Lugar/evento ao vivo agora, com o que a lista e o mapa mostram. */
export type LiveNowItem = {
  streamId: string;
  entityType: StreamEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  whenLabel: string | null;
  href: string;
  location: { lat: number; lon: number } | null;
  /** Desde quando o sinal está no ar. */
  liveSince: Date;
};

/** RF20 — "Com live agora": lives no ar com nome, lugar e horário (APIs públicas de places/events). */
export class ListLiveNow {
  constructor(
    private readonly streams: Pick<PublicStreamReader, "listLive">,
    private readonly directory: LiveTargetDirectory,
  ) {}

  async execute(limit = LIVE_NOW_MAX): Promise<LiveNowItem[]> {
    const live = await this.streams.listLive(Math.min(Math.max(1, Math.trunc(limit)), LIVE_NOW_MAX));
    if (live.length === 0) return [];
    const infos = new Map((await this.directory.describe(live.map((s) => ({ entityType: s.entityType, entityId: s.entityId })))).map((i) => [targetKey(i), i]));
    // Lugar/evento que não existe mais (ex.: apagado) fica de fora.
    return live.flatMap((s) => {
      const info = infos.get(targetKey(s));
      return info ? [{ ...info, streamId: s.id, liveSince: s.signalChangedAt }] : [];
    });
  }
}

/** Resposta do GET /api/live/active (polling do selo): só tipo e id das lives no ar. */
export type ActiveStreamsView = { streams: Array<{ entityType: StreamEntityType; entityId: string }> };

export class GetActiveStreams {
  constructor(private readonly active: Pick<ListActiveStreams, "execute">) {}

  async execute(): Promise<Result<ActiveStreamsView, DomainError>> {
    const streams = await this.active.execute(LIVE_NOW_MAX);
    return ok({ streams: streams.map(({ entityType, entityId }) => ({ entityType, entityId })) });
  }
}

/** Propriedades de cada marcador da camada Live do mapa (o mínimo para o resumo e o link). */
export type LiveFeatureProperties = { streamId: string; entityType: StreamEntityType; title: string; subtitle: string | null; href: string };

export type LiveFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; id: string; geometry: { type: "Point"; coordinates: [number, number] }; properties: LiveFeatureProperties }>;
};

/** GET /api/live/map — lives no ar como GeoJSON (só as que têm coordenadas). */
export class GetLiveNowGeo {
  constructor(private readonly liveNow: Pick<ListLiveNow, "execute">) {}

  async execute(): Promise<Result<LiveFeatureCollection, DomainError>> {
    const items = await this.liveNow.execute();
    return ok({
      type: "FeatureCollection",
      features: items.flatMap((i) =>
        i.location
          ? [
              {
                type: "Feature" as const,
                id: i.streamId,
                // GeoJSON é [longitude, latitude].
                geometry: { type: "Point" as const, coordinates: [Number(i.location.lon.toFixed(6)), Number(i.location.lat.toFixed(6))] as [number, number] },
                properties: { streamId: i.streamId, entityType: i.entityType, title: i.title, subtitle: i.subtitle, href: i.href },
              },
            ]
          : [],
      ),
    });
  }
}
