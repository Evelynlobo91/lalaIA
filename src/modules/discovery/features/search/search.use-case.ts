import { err, ok, type DomainError, type Result } from "@/shared/kernel";
import {
  isExcluded,
  resultKinds,
  type EventCriteria,
  type Excluded,
  type HitPage,
  type PageRequest,
  type PlaceCriteria,
  type ResultGroup,
  type ResultKind,
  type SearchableEvents,
  type SearchablePlaces,
  type SearchFilter,
  type SearchResults,
} from "../../domain/search";

export type SearchInput = {
  /** Texto livre (já validado). */
  text: string | null;
  /** Só um tipo (aba "Lugares"/"Eventos" ou "carregar mais" de um grupo); `null` = os dois. */
  kind: ResultKind | null;
  /** Cursor do grupo de `kind` (exige `kind`). */
  cursor: string | null;
  limit: number;
};

type Lane<C> = {
  criteria: C;
  apply: (filter: SearchFilter, criteria: C) => C | Excluded | Promise<C | Excluded>;
  search: (criteria: C, page: PageRequest) => Promise<Result<HitPage, DomainError>>;
};

/**
 * RF04 — Busca unificada: pergunta a places e events (cada um pelo seu `index.ts`, sem join entre schemas)
 * e devolve os resultados agrupados por tipo, cada grupo com a sua paginação.
 */
export class Search {
  constructor(
    private readonly places: SearchablePlaces,
    private readonly events: SearchableEvents,
  ) {}

  async execute(input: SearchInput, filters: SearchFilter[] = []): Promise<Result<SearchResults, DomainError>> {
    const page: PageRequest = { cursor: input.cursor, limit: input.limit };
    const kinds = input.kind ? [input.kind] : [...resultKinds];

    const groups = await Promise.all(
      kinds.map((kind) =>
        kind === "lugares"
          ? this.run<PlaceCriteria>(kind, { criteria: { text: input.text }, apply: (f, c) => f.places(c), search: (c, p) => this.places.search(c, p) }, filters, page)
          : this.run<EventCriteria>(kind, { criteria: { text: input.text }, apply: (f, c) => f.events(c), search: (c, p) => this.events.search(c, p) }, filters, page),
      ),
    );

    const failed = groups.find((g) => !g.ok);
    if (failed && !failed.ok) return err(failed.error);
    return ok({ groups: groups.flatMap((g) => (g.ok ? [g.value] : [])) });
  }

  /** Aplica os filtros em sequência; se algum tirar o tipo da busca, nem consulta o módulo. */
  private async run<C>(kind: ResultKind, lane: Lane<C>, filters: SearchFilter[], page: PageRequest): Promise<Result<ResultGroup, DomainError>> {
    let criteria = lane.criteria;
    for (const filter of filters) {
      const applied = await lane.apply(filter, criteria);
      if (isExcluded(applied as object)) return ok({ kind, items: [], nextCursor: null, excluded: (applied as Excluded).excluded });
      criteria = applied as C;
    }
    const result = await lane.search(criteria, page);
    return result.ok ? ok({ kind, ...result.value, excluded: null }) : result;
  }
}
