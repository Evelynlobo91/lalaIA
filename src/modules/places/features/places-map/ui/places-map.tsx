"use client";

import { ChevronRight, List, MapPinned, Navigation, X } from "lucide-react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Badge, ButtonLink, buttonClasses } from "@/shared/ui";
import { MapView } from "@/shared/ui/map";
import { directionsUrl } from "../../../domain/place-details";
import { roundCoordinate } from "../../nearby-places/nearby-places.schema";
import { PLACES_CLICKABLE_LAYERS, placesLayer, type SelectedPlace } from "./places-layer";

type Point = { lat: number; lon: number };

const BRAND = "#02407f";

/**
 * Mapa de lugares (RF11): clusters, toque no marcador abre o resumo e `focus` abre já centralizado.
 * Toque num ponto vazio marca o local e oferece "Lugares perto daqui" (RF12, sem depender do GPS).
 */
export function PlacesMap({ focus }: { focus?: SelectedPlace | null }) {
  const [selected, setSelected] = useState<SelectedPlace | null>(focus ?? null);
  const [picked, setPicked] = useState<Point | null>(null);
  // Marcador do ponto escolhido: objeto estável criado uma vez (instância do MapLibre, fora do React).
  const [pin] = useState(() => ({ marker: null as Marker | null }));

  const clearPick = useCallback(() => {
    pin.marker?.remove();
    setPicked(null);
  }, [pin]);

  const layers = useMemo(
    () => [
      placesLayer({
        dataUrl: "/api/places/geo",
        onSelect: (place) => {
          clearPick();
          setSelected(place);
        },
      }),
    ],
    [clearPick],
  );

  const onReady = useCallback((map: MapLibreMap) => {
    map.on("click", (e) => {
      // Toque já tratado por outra camada (ex.: marcador da Live).
      if (e.defaultPrevented) return;
      // Toque num lugar/cluster é tratado pela camada de lugares.
      if (map.queryRenderedFeatures(e.point, { layers: PLACES_CLICKABLE_LAYERS }).length > 0) return;
      const point = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      pin.marker ??= new Marker({ color: BRAND });
      pin.marker.setLngLat([point.lon, point.lat]).addTo(map);
      setSelected(null);
      setPicked(point);
    });
  }, [pin]);

  return (
    <div className="relative h-full">
      <MapView
        layers={layers}
        onReady={onReady}
        label="Mapa de lugares de Joinville"
        className="h-full"
        center={focus ? [focus.lon, focus.lat] : undefined}
        zoom={focus ? 16 : undefined}
      />

      <ButtonLink href="/lugares" variant="secondary" size="sm" className="absolute left-3 top-3 shadow-md">
        <List aria-hidden className="size-4" /> Ver em lista
      </ButtonLink>

      {selected && (
        <Panel label={`Resumo: ${selected.name}`} onClose={() => setSelected(null)} closeLabel="Fechar resumo">
          <div className="min-w-0">
            <Badge variant="brand">{selected.categoryLabel}</Badge>
            <h2 className="mt-1 truncate text-lg font-semibold">{selected.name}</h2>
          </div>
          <div className="flex gap-2">
            <Link href={`/lugares/${selected.id}`} prefetch={false} className={buttonClasses({ size: "sm" }, "flex-1")}>
              Ver detalhes <ChevronRight aria-hidden className="size-4" />
            </Link>
            <a href={directionsUrl(selected)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" }, "flex-1")}>
              <Navigation aria-hidden className="size-4" /> Como chegar
            </a>
          </div>
        </Panel>
      )}

      {picked && (
        <Panel label="Ponto escolhido no mapa" onClose={clearPick} closeLabel="Desmarcar ponto">
          <p className="flex items-center gap-2 font-medium">
            <MapPinned aria-hidden className="size-5 text-brand" /> Ponto escolhido no mapa
          </p>
          <Link
            href={`/lugares/perto?lat=${roundCoordinate(picked.lat)}&lon=${roundCoordinate(picked.lon)}`}
            prefetch={false}
            className={buttonClasses({ size: "sm", fullWidth: true })}
          >
            Lugares perto daqui <ChevronRight aria-hidden className="size-4" />
          </Link>
        </Panel>
      )}
    </div>
  );
}

function Panel({ label, onClose, closeLabel, children }: { label: string; onClose: () => void; closeLabel: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} aria-live="polite" className="absolute inset-x-3 bottom-9 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg md:left-auto md:w-96">
      <button type="button" onClick={onClose} aria-label={closeLabel} className="absolute right-2 top-2 rounded-full p-2 hover:bg-surface">
        <X aria-hidden className="size-5" />
      </button>
      <div className="flex flex-col gap-3 pr-8">{children}</div>
    </section>
  );
}
