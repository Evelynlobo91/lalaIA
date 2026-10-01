import { categories, type CategoryId } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { isOpenAt } from "../../domain/opening-hours";
import type { Coordinates } from "../../domain/place";
import type { PlaceCard } from "../../domain/place-card";
import type { PlaceListItem } from "../list-places/list-places.use-case";
import type { NearbyPlacesInput } from "./nearby-places.schema";

export type NearbyPlace = PlaceCard & { distanceMeters: number };

export interface NearbyPlacesReader {
  /** Lugares dentro do raio, do mais perto para o mais longe. */
  nearby(origin: Coordinates, radiusMeters: number, limit: number): Promise<NearbyPlace[]>;
}

export type NearbyPlaceItem = PlaceListItem & { distanceMeters: number; distanceLabel: string };

export type NearbyPlacesResult = { origin: Coordinates; radiusMeters: number; items: NearbyPlaceItem[] };

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));
const km = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "80 m", "950 m", "1,2 km", "12 km". Metros arredondados de 10 em 10 (a origem já é aproximada). */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${km.format(meters / 1000)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/** RF12 — Lugares próximos a uma localização (do GPS ou escolhida no mapa). A localização não é gravada. */
export class FindNearbyPlaces {
  constructor(
    private readonly reader: NearbyPlacesReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: NearbyPlacesInput): Promise<Result<NearbyPlacesResult, DomainError>> {
    const origin = { lat: input.lat, lon: input.lon };
    const places = await this.reader.nearby(origin, input.radius, input.limit);
    const now = this.now();

    return ok({
      origin,
      radiusMeters: input.radius,
      items: places.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category as CategoryId,
        categoryLabel: labels.get(p.category) ?? p.category,
        neighborhood: p.neighborhood,
        openNow: isOpenAt(p.openingHours, now),
        distanceMeters: Math.round(p.distanceMeters),
        distanceLabel: formatDistance(p.distanceMeters),
      })),
    });
  }
}
