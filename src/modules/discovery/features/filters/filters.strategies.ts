import { dateWindow } from "@/modules/events";
import type { CategoryId } from "@/shared/catalog/categories";
import { priceRanges, type PriceRange } from "../../domain/price-ranges";
import { exclude, type EventCriteria, type Period, type PlaceCriteria, type SearchFilter } from "../../domain/search";
import { timePeriods } from "../../domain/time-of-day";
import type { FiltersInput } from "./filters.schema";

// Cada filtro é uma estratégia (SearchFilter). Um filtro novo é uma classe nova aqui e uma linha na fábrica.

/** Categoria do catálogo: vale para lugares e eventos. */
export class CategoryFilter implements SearchFilter {
  constructor(private readonly category: CategoryId) {}
  places(c: PlaceCriteria): PlaceCriteria {
    return { ...c, category: this.category };
  }
  events(c: EventCriteria): EventCriteria {
    return { ...c, category: this.category };
  }
}

/** Porta: ids dos lugares de um bairro (API pública do módulo places). */
export interface PlacesInNeighborhood {
  placeIdsIn(neighborhood: string): Promise<string[]>;
}

/** Localização por bairro: lugares do bairro e eventos que acontecem em lugares do bairro. */
export class NeighborhoodFilter implements SearchFilter {
  constructor(
    private readonly neighborhood: string,
    private readonly lookup: PlacesInNeighborhood,
  ) {}
  places(c: PlaceCriteria): PlaceCriteria {
    return { ...c, neighborhood: this.neighborhood };
  }
  async events(c: EventCriteria): Promise<EventCriteria> {
    // Sem join entre schemas: pergunta ao módulo places quais lugares ficam no bairro.
    return { ...c, placeIds: await this.lookup.placeIdsIn(this.neighborhood) };
  }
}

/** Data e/ou horário: eventos que acontecem no período; lugares abertos nele (pelo horário de funcionamento). */
export class TimeFilter implements SearchFilter {
  constructor(private readonly periods: Period[]) {}
  places(c: PlaceCriteria): PlaceCriteria {
    return { ...c, openDuring: this.periods };
  }
  events(c: EventCriteria): EventCriteria {
    return { ...c, periods: this.periods };
  }
}

export const PRICE_EXCLUDES_PLACES = "Lugares não têm preço cadastrado: com o filtro de preço, aparecem só eventos.";

/** Faixa de preço: só eventos têm preço, então os lugares saem da busca (com o motivo). */
export class PriceFilter implements SearchFilter {
  constructor(private readonly range: PriceRange) {}
  places() {
    return exclude(PRICE_EXCLUDES_PLACES);
  }
  events(c: EventCriteria): EventCriteria {
    const { minCents, maxCents } = priceRanges[this.range];
    return { ...c, price: { minCents, maxCents } };
  }
}

/** Monta as estratégias a partir dos filtros validados da URL. */
export class SearchFilterFactory {
  constructor(
    private readonly places: PlacesInNeighborhood,
    private readonly now: () => Date = () => new Date(),
  ) {}

  from(input: Partial<FiltersInput>): SearchFilter[] {
    const now = this.now();
    const filters: SearchFilter[] = [];
    if (input.categoria) filters.push(new CategoryFilter(input.categoria));
    if (input.bairro) filters.push(new NeighborhoodFilter(input.bairro, this.places));
    const periods = timePeriods(input.quando ? dateWindow(input.quando, now) : null, input.horario ?? null, now);
    if (periods) filters.push(new TimeFilter(periods));
    if (input.preco) filters.push(new PriceFilter(input.preco));
    return filters;
  }
}
