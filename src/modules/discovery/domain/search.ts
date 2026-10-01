import type { DomainError, Result } from "@/shared/kernel";

/** Tipos de resultado da busca unificada (também é o valor do parâmetro `tipo` na URL). */
export const resultKinds = ["lugares", "eventos"] as const;
export type ResultKind = (typeof resultKinds)[number];

export const kindLabels: Record<ResultKind, string> = { lugares: "Lugares", eventos: "Eventos" };

/** Um resultado pronto para exibir, seja lugar ou evento. */
export type SearchHit = {
  id: string;
  href: string;
  title: string;
  categoryLabel: string;
  /** Onde: bairro (lugar) ou "Lugar · bairro" (evento). */
  where: string | null;
  /** Quando (só eventos): "sáb., 10 de out., 20:00 – 23:30". */
  when: string | null;
  badge: { label: string; tone: "success" | "neutral" | "live" } | null;
};

export type HitPage = { items: SearchHit[]; nextCursor: string | null };

export type ResultGroup = HitPage & {
  kind: ResultKind;
  /** Motivo de o tipo não aparecer (ex.: filtro que não se aplica a lugares); `null` se foi buscado. */
  excluded: string | null;
};

export type SearchResults = { groups: ResultGroup[] };

/** O que a busca pede ao módulo places. Novos filtros entram como campos opcionais (OCP). */
export type PlaceCriteria = { text: string | null };
/** O que a busca pede ao módulo events. Novos filtros entram como campos opcionais (OCP). */
export type EventCriteria = { text: string | null };

export type PageRequest = { cursor: string | null; limit: number };

/** Porta para a busca do módulo places (implementada sobre o `index.ts` dele). */
export interface SearchablePlaces {
  search(criteria: PlaceCriteria, page: PageRequest): Promise<Result<HitPage, DomainError>>;
}

/** Porta para a busca do módulo events (implementada sobre o `index.ts` dele). */
export interface SearchableEvents {
  search(criteria: EventCriteria, page: PageRequest): Promise<Result<HitPage, DomainError>>;
}

/** Um tipo de resultado que não atende a um filtro sai da busca, com o motivo para a pessoa. */
export type Excluded = { excluded: string };
export const exclude = (reason: string): Excluded => ({ excluded: reason });
export const isExcluded = (value: object): value is Excluded => "excluded" in value;

type Applied<C> = C | Excluded | Promise<C | Excluded>;

/**
 * Filtro combinável (estratégia): cada um restringe os critérios de lugares e de eventos do seu jeito,
 * ou tira o tipo da busca. Um filtro novo é uma classe nova, sem mexer na busca nem nos outros filtros.
 */
export interface SearchFilter {
  places(criteria: PlaceCriteria): Applied<PlaceCriteria>;
  events(criteria: EventCriteria): Applied<EventCriteria>;
}
