import type { MissionCard } from "@/modules/missions";
import type { CategoryId } from "@/shared/catalog/categories";
import { categoryLabel, type Candidate } from "../domain/candidate";
import type { CandidateSource } from "../domain/candidate-source";
import type { CandidateQuery, Point } from "../domain/constraints";

/** O que a fonte usa das APIs públicas de missions e places. */
export type MissionsForRecommendation = {
  available(): Promise<MissionCard[]>;
  distances(origin: Point, placeIds: string[]): Promise<Map<string, number>>;
  /** Categoria de cada lugar (`placeFacets` de places), para derivar a categoria da missão (#64). */
  facets(placeIds: string[]): Promise<Array<{ id: string; category: CategoryId }>>;
};

/**
 * Categoria da missão (missões não têm categoria própria): a mais comum entre os lugares das etapas;
 * empate fica com a que aparece primeiro na ordem das etapas. Sem lugares conhecidos → null.
 */
export function dominantCategory(placeIds: string[], categoryOf: Map<string, CategoryId>): CategoryId | null {
  const counts = new Map<CategoryId, number>();
  for (const id of placeIds) {
    const category = categoryOf.get(id);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let best: CategoryId | null = null;
  for (const [category, n] of counts) if (best === null || n > counts.get(best)!) best = category;
  return best;
}

/**
 * Missões disponíveis agora (as surpresa ficam de fora: não são públicas). Distância = a do lugar de etapa mais
 * perto; categoria derivada dos lugares das etapas; preço = gasto por pessoa informado; duração = tempo estimado.
 * Tudo pelas APIs públicas (sem join entre schemas), com uma consulta de distância e uma de categorias.
 */
export class MissionCandidateSource implements CandidateSource {
  readonly name = "missions";

  constructor(private readonly missions: MissionsForRecommendation) {}

  async find(q: CandidateQuery): Promise<Candidate[]> {
    const missions = await this.missions.available();
    const placeIds = [...new Set(missions.flatMap((m) => m.places.map((p) => p.id)))];
    const [distances, facets] = await Promise.all([
      q.origin && placeIds.length ? this.missions.distances(q.origin, placeIds) : Promise.resolve(new Map<string, number>()),
      placeIds.length ? this.missions.facets(placeIds) : Promise.resolve([]),
    ]);
    const categoryOf = new Map(facets.map((f) => [f.id, f.category]));
    return missions.flatMap((m): Candidate[] => {
      const category = dominantCategory(
        m.places.map((p) => p.id),
        categoryOf,
      );
      // Pré-filtro barato: com tipo de experiência escolhido, só as missões da categoria (o filtro duro confere de novo).
      if (q.categories && (!category || !q.categories.includes(category))) return [];
      const known = m.places.map((p) => distances.get(p.id)).filter((d): d is number => d !== undefined);
      const nearest = m.places.find((p) => distances.get(p.id) === Math.min(...known)) ?? m.places[0];
      return [
        {
          kind: "mission",
          id: m.id,
          title: m.title,
          category,
          categoryLabel: category ? categoryLabel(category) : null,
          placeName: nearest?.name ?? null,
          neighborhood: nearest?.neighborhood ?? null,
          href: `/missoes/${m.id}`,
          priceCents: m.costCents ?? null,
          availability: { known: true, window: { start: m.startsAt, end: m.endsAt } },
          distanceMeters: known.length ? Math.round(Math.min(...known)) : null,
          newSince: m.startsAt,
          xp: m.xp,
          durationMinutes: m.estimatedMinutes ?? null,
        },
      ];
    });
  }
}
