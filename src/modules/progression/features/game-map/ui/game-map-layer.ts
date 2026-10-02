import { Popup, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { MapLayer } from "@/shared/ui/map";
import { GAME_STATES, gameStateLabels, type GameState } from "../../../domain/game-map";

export const GAME_SOURCE = "game";
export const gameLayerId = (state: GameState) => `game-${state}`;

// Cores fixas (o canvas do mapa não lê variáveis CSS), na convenção da issue #69. Identidade nunca só pela cor:
// a legenda tem texto e ícone, e o toque abre o nome e a situação.
export const GAME_COLORS: Record<GameState, string> = {
  missao: "#02407f",
  evento: "#eab308",
  especial: "#b91c1c",
  conhecido: "#16a34a",
  inexplorado: "#9ca3af",
};

/** Camada do mapa de exploração: um círculo por lugar, uma camada MapLibre por estado (liga/desliga). */
export function gameMapLayer({ dataUrl, visible }: { dataUrl: string; visible: ReadonlySet<string> }): MapLayer {
  return {
    id: GAME_SOURCE,
    add(map: MapLibreMap) {
      map.addSource(GAME_SOURCE, { type: "geojson", data: dataUrl });
      // Do menos para o mais importante (os de cima são desenhados por último).
      for (const state of [...GAME_STATES].reverse()) {
        const unexplored = state === "inexplorado";
        map.addLayer({
          id: gameLayerId(state),
          type: "circle",
          source: GAME_SOURCE,
          filter: ["==", ["get", "state"], state],
          layout: { visibility: visible.has(state) ? "visible" : "none" },
          paint: {
            "circle-color": GAME_COLORS[state],
            "circle-radius": unexplored ? 4 : 8,
            "circle-opacity": unexplored ? 0.6 : 1,
            // Anel na cor da superfície: separa pontos sobrepostos.
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": unexplored ? 1 : 2,
          },
        });
      }

      const popup = new Popup({ closeButton: true, maxWidth: "260px" });
      const onClick = (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || e.defaultPrevented) return;
        e.preventDefault();
        const { id, name, state } = feature.properties as { id: string; name: string; state: GameState };
        // Conteúdo montado com textContent: nada de HTML vindo dos dados.
        const box = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = name;
        const status = document.createElement("p");
        status.textContent = gameStateLabels[state];
        const link = document.createElement("a");
        link.href = `/lugares/${encodeURIComponent(id)}`;
        link.textContent = "Ver lugar";
        link.className = "font-medium underline";
        box.append(title, status, link);
        popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      };
      const layerIds = GAME_STATES.map(gameLayerId);
      for (const id of layerIds) {
        map.on("click", id, onClick);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }
      return () => {
        popup.remove();
        for (const id of layerIds) map.off("click", id, onClick);
      };
    },
  };
}
