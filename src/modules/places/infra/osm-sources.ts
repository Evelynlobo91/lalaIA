import { readFile } from "node:fs/promises";
import type { OsmElement } from "../domain/osm/osm-element";
import type { OsmSource } from "../features/import-osm/import-osm.use-case";

// Município de Joinville/SC pelo Wikidata: o nome sozinho também casa com Joinville (França).
const JOINVILLE_WIKIDATA = "Q156819";

export const JOINVILLE_OVERPASS_QUERY = `[out:json][timeout:120];
area["wikidata"="${JOINVILLE_WIKIDATA}"]["boundary"="administrative"]->.jlle;
(
  nwr["amenity"~"^(restaurant|fast_food|food_court|bar|pub|biergarten|cafe|ice_cream|nightclub|marketplace|arts_centre|theatre|cinema|library|music_venue|events_venue)$"]["name"](area.jlle);
  nwr["tourism"~"^(museum|gallery|attraction|viewpoint|zoo|theme_park|artwork)$"]["name"](area.jlle);
  nwr["leisure"~"^(park|garden|nature_reserve|stadium|sports_centre|playground|water_park)$"]["name"](area.jlle);
  nwr["shop"~"^(mall|bakery|confectionery)$"]["name"](area.jlle);
  nwr["historic"]["name"](area.jlle);
);
out center tags;`;

type OverpassResponse = { elements: OsmElement[] };

// Servidores públicos do Overpass costumam ficar sobrecarregados (429/504): tentamos espelhos em sequência.
const DEFAULT_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const RETRYABLE = new Set([429, 502, 503, 504]);

/** Overpass API pública. A política de uso exige um User-Agent que identifique o app. */
export class OverpassOsmSource implements OsmSource {
  constructor(
    private readonly endpoints: string[] = DEFAULT_ENDPOINTS,
    private readonly options: { userAgent?: string; attemptsPerEndpoint?: number; backoffMs?: number; fetchFn?: typeof fetch; log?: (msg: string) => void } = {},
  ) {}

  async fetchElements(): Promise<OsmElement[]> {
    const { userAgent = "LalaIA/0.1 (hackathon Joinville; github.com/Evelynlobo91/lalaIA)", attemptsPerEndpoint = 2, backoffMs = 5_000, fetchFn = fetch, log = () => {} } = this.options;
    const failures: string[] = [];

    for (const endpoint of this.endpoints) {
      for (let attempt = 1; attempt <= attemptsPerEndpoint; attempt++) {
        try {
          const response = await fetchFn(endpoint, {
            method: "POST",
            headers: { "User-Agent": userAgent, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ data: JOINVILLE_OVERPASS_QUERY }),
            signal: AbortSignal.timeout(180_000),
          });
          if (response.ok) return ((await response.json()) as OverpassResponse).elements;
          failures.push(`${new URL(endpoint).host} → ${response.status}`);
          if (!RETRYABLE.has(response.status)) break;
        } catch (error) {
          failures.push(`${new URL(endpoint).host} → ${error instanceof Error ? error.message : String(error)}`);
        }
        log(`Overpass indisponível (${failures.at(-1)}), tentando de novo...`);
        if (attempt < attemptsPerEndpoint) await new Promise((r) => setTimeout(r, backoffMs * attempt));
      }
    }
    throw new Error(`Nenhum servidor Overpass respondeu. Tentativas: ${failures.join("; ")}. Use o snapshot: npm run places:seed`);
  }
}

/** Snapshot salvo no repositório (supabase/seed-data): seed reproduzível e sem depender de rede. */
export class FileOsmSource implements OsmSource {
  constructor(private readonly path: string) {}

  async fetchElements(): Promise<OsmElement[]> {
    return (JSON.parse(await readFile(this.path, "utf8")) as OverpassResponse).elements;
  }
}
