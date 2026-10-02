import type { CategoryId } from "@/shared/catalog/categories";
import type { Candidate } from "./candidate";
import { horizonOf, type SearchConstraints } from "./constraints";

/**
 * Filtro duro (estratégia, OCP): decide se o candidato cabe nas restrições. Um filtro novo é uma nova
 * classe registrada em `defaultFilters`, sem `if` no caso de uso. Filtros não conhecem os outros.
 */
export interface CandidateFilter {
  /** Nome para testes/diagnóstico. */
  readonly name: string;
  keep(candidate: Candidate, constraints: SearchConstraints): boolean;
}

/** Tempo mínimo para valer a ida (min). Com menos tempo disponível, vale o tempo disponível. */
export const MIN_VISIT_MINUTES = 30;

/**
 * Categorias ao ar livre (parques, passeios): sem horário informado, consideramos acessíveis; sem preço,
 * consideramos gratuitas. Para as demais, horário desconhecido não entra (não arriscamos um "fechado").
 */
export const OPEN_AIR_CATEGORIES: readonly CategoryId[] = ["ar-livre", "passeios"];

const isOpenAir = (c: Candidate) => c.category !== null && OPEN_AIR_CATEGORIES.includes(c.category);

/** Cabe no tempo: aberto/acontecendo por pelo menos `MIN_VISIT_MINUTES` dentro do tempo disponível (ex.: fechando em 10 min → fora). */
export class FitsTimeWindow implements CandidateFilter {
  readonly name = "tempo";

  keep(c: Candidate, k: SearchConstraints): boolean {
    if (!c.availability.known) return isOpenAir(c);
    const window = c.availability.window;
    if (!window) return false;
    const start = Math.max(k.now.getTime(), window.start.getTime());
    const end = Math.min(window.end.getTime(), horizonOf(k).getTime());
    const needed = Math.min(MIN_VISIT_MINUTES, k.availableMinutes) * 60_000;
    return end - start >= needed;
  }
}

/** Cabe no orçamento do grupo (preço por pessoa × pessoas). Sem preço: entra, exceto em "só grátis" (salvo ao ar livre). */
export class FitsBudget implements CandidateFilter {
  readonly name = "orçamento";

  keep(c: Candidate, k: SearchConstraints): boolean {
    if (k.budgetCents === null) return true;
    if (c.priceCents === null) return k.budgetCents > 0 || isOpenAir(c);
    return c.priceCents * k.people <= k.budgetCents;
  }
}

/** Dentro da distância máxima. Sem localização, não filtra; com ela, distância desconhecida não entra. */
export class WithinDistance implements CandidateFilter {
  readonly name = "distância";

  keep(c: Candidate, k: SearchConstraints): boolean {
    if (!k.origin) return true;
    return c.distanceMeters !== null && c.distanceMeters <= k.maxDistanceMeters;
  }
}

/** Do tipo de experiência pedido (categorias). Missões não têm categoria: só entram sem tipo escolhido. */
export class MatchesExperience implements CandidateFilter {
  readonly name = "tipo";

  keep(c: Candidate, k: SearchConstraints): boolean {
    if (!k.categories) return true;
    return c.category !== null && k.categories.includes(c.category);
  }
}

/** "Quero algo diferente": fora das categorias de sempre. */
export class AvoidsUsual implements CandidateFilter {
  readonly name = "diferente";

  keep(c: Candidate, k: SearchConstraints): boolean {
    return c.category === null || !k.avoidCategories.includes(c.category);
  }
}

export const defaultFilters: readonly CandidateFilter[] = [new FitsTimeWindow(), new FitsBudget(), new WithinDistance(), new MatchesExperience(), new AvoidsUsual()];

/** Aplica todos os filtros (E lógico). */
export function applyFilters(candidates: Candidate[], filters: readonly CandidateFilter[], constraints: SearchConstraints): Candidate[] {
  return candidates.filter((c) => filters.every((f) => f.keep(c, constraints)));
}
