"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/shared/ui";

export type PickedPlace = { id: string; name: string; neighborhood?: string | null };
type Suggestion = PickedPlace & { categoryLabel: string };

/**
 * Seletor de lugar com sugestões (combobox acessível). Envia o id escolhido no campo oculto `name`.
 * Busca em /api/places/search depois de 2 letras, com pequena espera para não disparar a cada tecla.
 */
export function PlacePicker({ name, label, initial, errors }: { name: string; label: string; initial?: PickedPlace | null; errors?: string[] }) {
  const id = useId();
  const listId = `${id}-lista`;
  const [picked, setPicked] = useState<PickedPlace | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).catch(() => null);
      if (res?.ok) {
        setResults(await res.json());
        setActive(-1);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, picked]);

  const choose = (place: Suggestion) => {
    setPicked(place);
    setResults([]);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex h-12 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4">
          <span className="flex min-w-0 items-center gap-2">
            <MapPin aria-hidden className="size-4 shrink-0 text-brand" />
            <span className="truncate">
              {picked.name}
              {picked.neighborhood ? ` · ${picked.neighborhood}` : ""}
            </span>
          </span>
          <button type="button" onClick={() => setPicked(null)} aria-label="Trocar lugar" className="rounded-full p-1.5 hover:bg-surface-2">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={errors?.length ? true : undefined}
            autoComplete="off"
            placeholder="Digite o nome do lugar"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              else if (e.key === "Enter" && active >= 0) {
                e.preventDefault();
                choose(results[active]);
              } else if (e.key === "Escape") setResults([]);
            }}
            className="h-12 w-full rounded-xl border border-border bg-bg px-4 text-base aria-invalid:border-danger"
          />
          {results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Sugestões de lugares" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-bg shadow-lg">
              {results.map((place, i) => (
                <li
                  key={place.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(place);
                  }}
                  className={cn("cursor-pointer px-4 py-2.5", i === active ? "bg-surface-2" : "hover:bg-surface")}
                >
                  <span className="block font-medium">{place.name}</span>
                  <span className="block text-sm text-muted">
                    {place.categoryLabel}
                    {place.neighborhood ? ` · ${place.neighborhood}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {errors?.length ? <p className="text-sm text-danger">{errors[0]}</p> : null}
    </div>
  );
}
