import type { CategoryId } from "@/shared/catalog/categories";
import { placeFromOsm, type OsmElement, type SkipReason } from "../../domain/osm/osm-element";
import type { PlaceDraft, PlaceImportRepository, UpsertReport } from "../../domain/place";

/** Porta: de onde vêm os elementos do OSM (API Overpass ao vivo ou arquivo salvo). */
export interface OsmSource {
  fetchElements(): Promise<OsmElement[]>;
}

export type ImportReport = UpsertReport & {
  fetched: number;
  skipped: Partial<Record<SkipReason | "duplicado", number>>;
  byCategory: Partial<Record<CategoryId, number>>;
};

/** RF09 — Popular o "Onde ir" com lugares reais de Joinville a partir do OpenStreetMap. */
export class ImportOsmPlaces {
  constructor(
    private readonly source: OsmSource,
    private readonly repository: PlaceImportRepository,
  ) {}

  async execute(): Promise<ImportReport> {
    const elements = await this.source.fetchElements();
    const skipped: ImportReport["skipped"] = {};
    const byCategory: ImportReport["byCategory"] = {};
    const drafts = new Map<string, PlaceDraft>();

    for (const element of elements) {
      const result = placeFromOsm(element);
      if (!result.ok) {
        skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
        continue;
      }
      if (drafts.has(result.draft.sourceId)) {
        skipped.duplicado = (skipped.duplicado ?? 0) + 1;
        continue;
      }
      drafts.set(result.draft.sourceId, result.draft);
      byCategory[result.draft.category] = (byCategory[result.draft.category] ?? 0) + 1;
    }

    const upsert = await this.repository.upsertMany([...drafts.values()]);
    return { fetched: elements.length, ...upsert, skipped, byCategory };
  }
}
