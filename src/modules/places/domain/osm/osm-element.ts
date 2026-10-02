import type { PlaceDraft } from "../place";
import { categoryFromOsmTags, type OsmTags } from "./osm-category-rules";

/** Elemento como vem do Overpass com `out center tags` (vias e relações trazem `center`). */
export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

export type SkipReason = "sem_nome" | "sem_categoria" | "sem_coordenada";

// Caixa ao redor de Joinville: protege contra dados com coordenada errada vindos da fonte.
const JOINVILLE_BOUNDS = { minLat: -26.6, maxLat: -26.0, minLon: -49.3, maxLon: -48.6 };

const clean = (value: string | undefined, max: number): string | null => {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};

/** Aceita só URLs http(s); "www.site.com" vira "https://www.site.com". Nada de javascript:/data:. */
export function safeWebsite(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") || /\s/.test(candidate)) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Converte um elemento do OSM em lugar do LalaIA, ou explica por que ele foi descartado. */
export function placeFromOsm(element: OsmElement): { ok: true; draft: PlaceDraft } | { ok: false; reason: SkipReason } {
  const tags = element.tags ?? {};
  const name = clean(tags.name, 200);
  if (!name) return { ok: false, reason: "sem_nome" };

  const category = categoryFromOsmTags(tags);
  if (!category) return { ok: false, reason: "sem_categoria" };

  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const inside =
    lat !== undefined &&
    lon !== undefined &&
    lat >= JOINVILLE_BOUNDS.minLat &&
    lat <= JOINVILLE_BOUNDS.maxLat &&
    lon >= JOINVILLE_BOUNDS.minLon &&
    lon <= JOINVILLE_BOUNDS.maxLon;
  if (!inside) return { ok: false, reason: "sem_coordenada" };

  return {
    ok: true,
    draft: {
      source: "osm",
      sourceId: `${element.type}/${element.id}`,
      name,
      category,
      address: {
        street: clean(tags["addr:street"], 200),
        houseNumber: clean(tags["addr:housenumber"], 20),
        neighborhood: clean(tags["addr:suburb"] ?? tags["addr:neighbourhood"], 120),
        postcode: clean(tags["addr:postcode"], 20),
        city: "Joinville",
      },
      phone: clean(tags.phone ?? tags["contact:phone"], 60),
      website: safeWebsite(tags.website ?? tags["contact:website"]),
      openingHours: clean(tags.opening_hours, 255),
      location: { lat: lat!, lon: lon! },
    },
  };
}
