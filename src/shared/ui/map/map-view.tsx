"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, GeolocateControl, Map as MapLibreMap, NavigationControl, getVersion, setWorkerUrl } from "maplibre-gl";
import { useContext, useEffect, useRef } from "react";
import { cn } from "../cn";
import { JOINVILLE_CENTER, baseStyle } from "./base-style";
import type { MapLayer } from "./map-layer";
import { MapLayersContext } from "./map-layers-context";

type MapViewProps = {
  layers: MapLayer[];
  center?: [number, number];
  zoom?: number;
  /** Descrição para leitores de tela (o mapa em si é visual; ofereça também uma alternativa em lista). */
  label: string;
  className?: string;
  /** Chamado quando o mapa e as camadas estão prontos (ex.: centralizar num item). */
  onReady?: (map: MapLibreMap) => void;
};

/**
 * Mapa genérico do LalaIA. Não conhece nenhum módulo: recebe camadas plugáveis (MapLayer).
 * Carregado só no navegador (MapLibre usa WebGL).
 */
export function MapView({ layers, center = JOINVILLE_CENTER, zoom = 12, label, className, onReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Camadas extras de quem envolve o mapa (ex.: Live na página /mapa), desenhadas por cima.
  const extraLayers = useContext(MapLayersContext);
  // Camadas e callback são lidos na criação do mapa; quem usa deve passá-los estáveis (useMemo).
  const initial = useRef({ layers: [...layers, ...extraLayers], center, zoom, onReady });

  useEffect(() => {
    if (!containerRef.current) return;
    const { layers, center, zoom, onReady } = initial.current;
    // Worker servido por nós (scripts/copy-maplibre-worker.mjs); o caminho padrão quebra no bundle do Next.
    setWorkerUrl(`/vendor/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: baseStyle(),
        center,
        zoom,
        minZoom: 9,
        maxBounds: [
          [-49.6, -26.9],
          [-48.3, -25.8],
        ],
        attributionControl: false,
      });
    } catch {
      // Navegador sem WebGL: o contêiner é do MapLibre (sem filhos React), então a mensagem vai direto no DOM.
      containerRef.current.setAttribute("data-failed", "true");
      containerRef.current.textContent = "Seu navegador não conseguiu abrir o mapa. Use a lista de lugares.";
      return;
    }

    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");

    const cleanups: Array<() => void> = [];
    map.on("load", () => {
      for (const layer of layers) {
        const cleanup = layer.add(map);
        if (cleanup) cleanups.push(cleanup);
      }
      containerRef.current?.setAttribute("data-ready", "true");
      onReady?.(map);
    });

    return () => {
      cleanups.forEach((fn) => fn());
      map.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-surface-2",
        "data-[failed=true]:flex data-[failed=true]:items-center data-[failed=true]:justify-center data-[failed=true]:p-6 data-[failed=true]:text-center data-[failed=true]:text-muted",
        className,
      )}
    />
  );
}
