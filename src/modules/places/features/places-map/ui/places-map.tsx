"use client";

import { ChevronRight, List, Navigation, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, ButtonLink, buttonClasses } from "@/shared/ui";
import { MapView } from "@/shared/ui/map";
import { directionsUrl } from "../../../domain/place-details";
import { placesLayer, type SelectedPlace } from "./places-layer";

/** Mapa de lugares (RF11): clusters, toque abre o resumo, e `focus` abre já centralizado num lugar. */
export function PlacesMap({ focus }: { focus?: SelectedPlace | null }) {
  const [selected, setSelected] = useState<SelectedPlace | null>(focus ?? null);
  const layers = useMemo(() => [placesLayer({ dataUrl: "/api/places/geo", onSelect: setSelected })], []);

  return (
    <div className="relative h-full">
      <MapView
        layers={layers}
        label="Mapa de lugares de Joinville"
        className="h-full"
        center={focus ? [focus.lon, focus.lat] : undefined}
        zoom={focus ? 16 : undefined}
      />

      <ButtonLink href="/lugares" variant="secondary" size="sm" className="absolute left-3 top-3 shadow-md">
        <List aria-hidden className="size-4" /> Ver em lista
      </ButtonLink>

      {selected && (
        <section
          aria-label={`Resumo: ${selected.name}`}
          aria-live="polite"
          className="absolute inset-x-3 bottom-9 flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 shadow-lg md:left-auto md:w-96"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="brand">{selected.categoryLabel}</Badge>
              <h2 className="mt-1 truncate text-lg font-semibold">{selected.name}</h2>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Fechar resumo" className="rounded-full p-2 hover:bg-surface">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <Link href={`/lugares/${selected.id}`} prefetch={false} className={buttonClasses({ size: "sm" }, "flex-1")}>
              Ver detalhes <ChevronRight aria-hidden className="size-4" />
            </Link>
            <a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" }, "flex-1")}>
              <Navigation aria-hidden className="size-4" /> Como chegar
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
