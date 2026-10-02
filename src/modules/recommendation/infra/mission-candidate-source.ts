import type { MissionCard } from "@/modules/missions";
import type { Candidate } from "../domain/candidate";
import type { CandidateSource } from "../domain/candidate-source";
import type { CandidateQuery, Point } from "../domain/constraints";

/** O que a fonte usa das APIs públicas de missions e places. */
export type MissionsForRecommendation = {
  available(): Promise<MissionCard[]>;
  distances(origin: Point, placeIds: string[]): Promise<Map<string, number>>;
};

/**
 * Missões disponíveis agora. A distância é a do lugar de etapa mais perto. Sem categoria e sem preço:
 * só entram quando a busca não pede um tipo de experiência específico.
 */
export class MissionCandidateSource implements CandidateSource {
  readonly name = "missions";

  constructor(private readonly missions: MissionsForRecommendation) {}

  async find(q: CandidateQuery): Promise<Candidate[]> {
    if (q.categories) return [];
    const missions = await this.missions.available();
    const placeIds = [...new Set(missions.flatMap((m) => m.places.map((p) => p.id)))];
    const distances = q.origin && placeIds.length ? await this.missions.distances(q.origin, placeIds) : new Map<string, number>();
    return missions.map((m) => {
      const known = m.places.map((p) => distances.get(p.id)).filter((d): d is number => d !== undefined);
      const nearest = m.places.find((p) => distances.get(p.id) === Math.min(...known)) ?? m.places[0];
      return {
        kind: "mission",
        id: m.id,
        title: m.title,
        category: null,
        categoryLabel: null,
        placeName: nearest?.name ?? null,
        neighborhood: nearest?.neighborhood ?? null,
        href: `/missoes/${m.id}`,
        priceCents: null,
        availability: { known: true, window: { start: m.startsAt, end: m.endsAt } },
        distanceMeters: known.length ? Math.round(Math.min(...known)) : null,
        newSince: m.startsAt,
        xp: m.xp,
      };
    });
  }
}
