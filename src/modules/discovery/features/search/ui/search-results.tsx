"use client";

import { SearchX } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, EmptyState, FormAlert } from "@/shared/ui";
import { kindLabels, type ResultGroup, type SearchResults as Results } from "../../../domain/search";
import { SINGLE_PAGE_SIZE } from "../search-url";
import { ResultCard } from "./result-card";

const emptyText: Record<ResultGroup["kind"], string> = { lugares: "Nenhum lugar encontrado.", eventos: "Nenhum evento encontrado." };
const moreLabel: Record<ResultGroup["kind"], string> = { lugares: "Mais lugares", eventos: "Mais eventos" };

/** Um grupo (lugares ou eventos) com o seu próprio "carregar mais" pela API, mantendo a busca e os filtros. */
function Group({ group, query }: { group: ResultGroup; query: string }) {
  const [items, setItems] = useState(group.items);
  const [cursor, setCursor] = useState(group.nextCursor);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = kindLabels[group.kind];
  const headingId = `resultados-${group.kind}`;

  const loadMore = () =>
    startTransition(async () => {
      setError(false);
      const params = new URLSearchParams(query);
      params.set("tipo", group.kind);
      params.set("cursor", cursor!);
      params.set("limit", String(SINGLE_PAGE_SIZE));
      const res = await fetch(`/api/discovery/search?${params}`).catch(() => null);
      if (!res?.ok) return setError(true);
      const next = ((await res.json()) as Results).groups[0];
      setItems((current) => [...current, ...(next?.items ?? [])]);
      setCursor(next?.nextCursor ?? null);
    });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {label}
      </h2>
      {group.excluded ? (
        <p className="text-sm text-muted">{group.excluded}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{emptyText[group.kind]}</p>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2" aria-label={`${label} encontrados`}>
            {items.map((hit) => (
              <li key={hit.id}>
                <ResultCard hit={hit} kind={group.kind} />
              </li>
            ))}
          </ul>
          <div aria-live="polite" className="flex flex-col items-center gap-3">
            {error && <FormAlert>Não foi possível carregar mais resultados. Tente de novo.</FormAlert>}
            {cursor && (
              <Button variant="secondary" onClick={loadMore} loading={pending}>
                {moreLabel[group.kind]}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Resultados agrupados por tipo. `query`: a busca e os filtros da URL, repassados ao "carregar mais". */
export function SearchResults({ results, query }: { results: Results; query: string }) {
  const nothing = results.groups.every((g) => g.items.length === 0);
  if (nothing && results.groups.every((g) => !g.excluded)) {
    return <EmptyState icon={SearchX} title="Nada encontrado" description="Tente outras palavras ou menos filtros. A busca ignora acentos." />;
  }
  return (
    <div className="flex flex-col gap-8">
      {results.groups.map((group) => (
        <Group key={group.kind} group={group} query={query} />
      ))}
    </div>
  );
}
