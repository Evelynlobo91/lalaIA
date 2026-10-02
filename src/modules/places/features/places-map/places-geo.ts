import { categories, type CategoryId } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";

export type PlacePoint = { id: string; name: string; category: CategoryId; lat: number; lon: number };

export interface PlacePointsReader {
  allPoints(): Promise<PlacePoint[]>;
}

/** Propriedades mínimas no mapa: o detalhe completo vem da página do lugar. */
export type PlaceFeatureProperties = { id: string; name: string; category: CategoryId; categoryLabel: string };

export type PlacesFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: PlaceFeatureProperties;
  }>;
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** RF11 — Lugares como GeoJSON para o mapa (poucos KB para os ~500 lugares de Joinville). */
export class GetPlacesGeo {
  constructor(private readonly reader: PlacePointsReader) {}

  async execute(): Promise<Result<PlacesFeatureCollection, DomainError>> {
    const points = await this.reader.allPoints();
    return ok({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        id: p.id,
        // GeoJSON é [longitude, latitude]; 6 casas decimais ≈ 10 cm, mais que suficiente.
        geometry: { type: "Point", coordinates: [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))] },
        properties: { id: p.id, name: p.name, category: p.category, categoryLabel: labels.get(p.category) ?? p.category },
      })),
    });
  }
}
