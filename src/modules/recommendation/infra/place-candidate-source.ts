import type { PlaceCandidate, PlaceCandidatesQuery } from "@/modules/places";
import { openWindow } from "../domain/availability";
import { categoryLabel, type Candidate } from "../domain/candidate";
import type { CandidateSource } from "../domain/candidate-source";
import type { CandidateQuery } from "../domain/constraints";

/** O que a fonte usa da API pública de places (injetado na composição; mockado nos testes). */
export type PlacesForRecommendation = {
  candidates(query: PlaceCandidatesQuery): Promise<PlaceCandidate[]>;
  isOpenAt(openingHours: string | null, at: Date): boolean | null;
};

/** Quantos lugares buscar antes dos filtros (o "aberto agora" é calculado em memória). */
export const PLACE_CANDIDATE_LIMIT = 200;

/** Lugares abertos (ou abrindo) no período, perto da origem se houver. */
export class PlaceCandidateSource implements CandidateSource {
  readonly name = "places";

  constructor(private readonly places: PlacesForRecommendation) {}

  async find(q: CandidateQuery): Promise<Candidate[]> {
    const rows = await this.places.candidates({ origin: q.origin, radiusMeters: q.radiusMeters, categories: q.categories, limit: PLACE_CANDIDATE_LIMIT });
    return rows.map((p) => ({
      kind: "place",
      id: p.id,
      title: p.name,
      category: p.category,
      categoryLabel: categoryLabel(p.category),
      placeName: p.name,
      neighborhood: p.neighborhood,
      href: `/lugares/${p.id}`,
      priceCents: null,
      availability: openWindow((at) => this.places.isOpenAt(p.openingHours, at), q.now, q.horizon),
      distanceMeters: p.distanceMeters === null ? null : Math.round(p.distanceMeters),
      newSince: p.newSince,
      xp: null,
    }));
  }
}
