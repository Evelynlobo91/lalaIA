import type { CategoryId } from "@/shared/catalog/categories";

export type Point = { lat: number; lon: number };

/**
 * Restrições já resolvidas de uma busca (o que o motor recebe). A localização vive só durante a
 * requisição: nunca é gravada nem logada (LGPD).
 */
export type SearchConstraints = {
  now: Date;
  /** Tempo disponível a partir de agora. */
  availableMinutes: number;
  /** Orçamento total do grupo, em centavos; `null` = sem limite. */
  budgetCents: number | null;
  people: number;
  /** Já arredondada para ~10 m; `null` = sem localização (sem filtro nem sinal de distância). */
  origin: Point | null;
  maxDistanceMeters: number;
  /** Tipo de experiência: só estas categorias; `null` = qualquer. */
  categories: CategoryId[] | null;
  /** "Quero algo diferente": evita estas categorias (as de sempre). */
  avoidCategories: CategoryId[];
};

/** Fim do período disponível. */
export const horizonOf = (c: Pick<SearchConstraints, "now" | "availableMinutes">) => new Date(c.now.getTime() + c.availableMinutes * 60_000);

/** Consulta repassada às fontes de candidatos (pré-filtro barato; os filtros duros continuam valendo). */
export type CandidateQuery = {
  now: Date;
  horizon: Date;
  origin: Point | null;
  radiusMeters: number;
  categories: CategoryId[] | null;
};

export const queryFor = (c: SearchConstraints): CandidateQuery => ({
  now: c.now,
  horizon: horizonOf(c),
  origin: c.origin,
  radiusMeters: c.maxDistanceMeters,
  categories: c.categories,
});
