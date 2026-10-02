"use client";

import { MapPinOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, EmptyState, FormAlert } from "@/shared/ui";
import type { PlaceListItem, PlaceListPage } from "../list-places.use-case";
import { PlaceListCard } from "./place-list-card";

/** Lista com "Carregar mais": a primeira página vem do servidor; as próximas, da API /api/places. */
export function PlaceList({ initial }: { initial: PlaceListPage }) {
  const [items, setItems] = useState<PlaceListItem[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <EmptyState icon={MapPinOff} title="Nenhum lugar por aqui ainda" description="Assim que os lugares de Joinville forem cadastrados, eles aparecem nesta lista." />;
  }

  function loadMore() {
    if (!cursor) return;
    setError(false);
    startTransition(async () => {
      const response = await fetch(`/api/places?cursor=${encodeURIComponent(cursor)}`).catch(() => null);
      if (!response?.ok) {
        setError(true);
        return;
      }
      const page = (await response.json()) as PlaceListPage;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Lugares">
        {items.map((place) => (
          <li key={place.id}>
            <PlaceListCard place={place} />
          </li>
        ))}
      </ul>

      <div aria-live="polite" className="flex flex-col items-center gap-3">
        {error && <FormAlert>Não foi possível carregar mais lugares. Tente de novo.</FormAlert>}
        {cursor ? (
          <Button variant="secondary" onClick={loadMore} loading={pending}>
            Carregar mais
          </Button>
        ) : (
          <p className="text-sm text-muted">Você viu todos os {items.length} lugares.</p>
        )}
      </div>
    </div>
  );
}
