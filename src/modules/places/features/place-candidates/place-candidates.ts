import type { CategoryId } from "@/shared/catalog/categories";
import type { Coordinates } from "../../domain/place";

/** Lugar que pode virar sugestão (API pública para a Recomendação). */
export type PlaceCandidate = {
  id: string;
  name: string;
  category: CategoryId;
  neighborhood: string | null;
  /** Horário no formato do OSM; interprete com `isOpenAt`. */
  openingHours: string | null;
  /** Distância até a origem (m), ou null sem origem. */
  distanceMeters: number | null;
  /**
   * Desde quando o lugar é novidade no app: só para lugares cadastrados por parceiros.
   * Os importados do OpenStreetMap já existiam na cidade, então não contam como novidade (null).
   */
  newSince: Date | null;
};

export type PlaceCandidatesQuery = {
  /** Com origem: só os que estão no raio, do mais perto para o mais longe. Sem: os mais recentes primeiro. */
  origin: Coordinates | null;
  radiusMeters: number;
  /** Só estas categorias; null = todas. */
  categories: CategoryId[] | null;
  limit: number;
};

export interface PlaceCandidateReader {
  candidates(query: PlaceCandidatesQuery): Promise<PlaceCandidate[]>;
}

export const MAX_PLACE_CANDIDATES = 300;
export const MAX_CANDIDATE_RADIUS_M = 50_000;

/** Candidatos a sugestão: limita quantidade e raio antes de consultar o banco (PostGIS). */
export class FindPlaceCandidates {
  constructor(private readonly reader: PlaceCandidateReader) {}

  async execute(query: PlaceCandidatesQuery): Promise<PlaceCandidate[]> {
    if (query.categories && query.categories.length === 0) return [];
    return this.reader.candidates({
      ...query,
      radiusMeters: Math.min(Math.max(0, query.radiusMeters), MAX_CANDIDATE_RADIUS_M),
      limit: Math.min(Math.max(1, Math.floor(query.limit)), MAX_PLACE_CANDIDATES),
    });
  }
}
