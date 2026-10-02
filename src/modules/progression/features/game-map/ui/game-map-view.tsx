"use client";

import { Lock, Radio } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useMemo, useRef, useState } from "react";
import { MapView } from "@/shared/ui/map";
import { GAME_STATES, gameStateLabels, type GameState } from "../../../domain/game-map";
import type { GameLayer } from "../game-map.schema";
import { GAME_COLORS, gameLayerId, gameMapLayer } from "./game-map-layer";

// Ids das camadas do módulo live (somadas pela página via LiveMapLayers).
const LIVE_LAYER_IDS = ["live-halo", "live-points", "live-label"];

type Props = { counts: Record<GameState, number>; initial: GameLayer[] };

/**
 * #69 — Mapa como jogo: legenda com cada estado (cor + texto + quantidade) e liga/desliga por camada.
 * As camadas escolhidas ficam na URL (`?camadas=`), para compartilhar a mesma visão.
 */
export function GameMapView({ counts, initial }: Props) {
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set(initial));
  const mapRef = useRef<MapLibreMap | null>(null);
  // Estáveis: o MapView lê as camadas só na criação.
  const [initialVisible] = useState(() => new Set(initial));
  const layers = useMemo(() => [gameMapLayer({ dataUrl: "/api/progression/game-map", visible: initialVisible })], [initialVisible]);

  const apply = useCallback((map: MapLibreMap, set: ReadonlySet<string>) => {
    for (const state of GAME_STATES) map.setLayoutProperty(gameLayerId(state), "visibility", set.has(state) ? "visible" : "none");
    for (const id of LIVE_LAYER_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", set.has("live") ? "visible" : "none");
  }, []);

  const onReady = useCallback(
    (map: MapLibreMap) => {
      mapRef.current = map;
      apply(map, initialVisible);
    },
    [apply, initialVisible],
  );

  function toggle(layer: GameLayer) {
    const next = new Set(visible);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    setVisible(next);
    if (mapRef.current) apply(mapRef.current, next);
    const url = new URL(window.location.href);
    url.searchParams.set("camadas", [...next].join(","));
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <legend className="float-left mb-2 w-full font-semibold">Seu mapa de descobertas</legend>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_STATES.map((state) => (
            <li key={state}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                <input type="checkbox" checked={visible.has(state)} onChange={() => toggle(state)} className="size-4 accent-brand" />
                {state === "inexplorado" ? (
                  <Lock aria-hidden className="size-4 text-muted" />
                ) : (
                  <span aria-hidden className="size-3.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: GAME_COLORS[state] }} />
                )}
                <span className="flex-1 text-sm">{gameStateLabels[state]}</span>
                <span className="text-sm tabular-nums text-muted">{counts[state]}</span>
              </label>
            </li>
          ))}
          <li>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <input type="checkbox" checked={visible.has("live")} onChange={() => toggle("live")} className="size-4 accent-brand" />
              <Radio aria-hidden className="size-4 text-live" />
              <span className="flex-1 text-sm">Live (transmissão ativa)</span>
            </label>
          </li>
        </ul>
      </fieldset>
      <MapView layers={layers} onReady={onReady} label="Mapa de exploração: lugares por situação" className="h-[60vh] min-h-80 overflow-hidden rounded-3xl shadow-sm" />
    </div>
  );
}
