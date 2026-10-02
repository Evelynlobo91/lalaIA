import type { CategoryId } from "@/shared/catalog/categories";

export type Coordinates = { lat: number; lon: number };

export type Address = {
  street: string | null;
  houseNumber: string | null;
  neighborhood: string | null;
  postcode: string | null;
  city: string;
};

/** Lugar pronto para ser gravado (ainda sem id do banco). */
export type PlaceDraft = {
  source: "osm" | "partner";
  sourceId: string;
  name: string;
  category: CategoryId;
  address: Address;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  location: Coordinates;
};

export type UpsertReport = { inserted: number; updated: number; unchanged: number };

export interface PlaceImportRepository {
  /** Grava/atualiza pela origem (source + sourceId). Idempotente. */
  upsertMany(drafts: PlaceDraft[]): Promise<UpsertReport>;
}
