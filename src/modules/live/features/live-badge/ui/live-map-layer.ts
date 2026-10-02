import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { MAP_FONT, type MapLayer } from "@/shared/ui/map";
import { pollWhileVisible } from "../../stream-states/ui/poll-while-visible";
import type { LiveFeatureProperties } from "../live-badge.use-case";

const SOURCE = "live";
const HALO = "live-halo";
const POINTS = "live-points";
const LABEL = "live-label";

// Cores fixas (o canvas do mapa não lê variáveis CSS): vermelho do selo "Ao vivo", borda branca para contraste.
const LIVE = "#d6204e";

/**
 * Camada "lives" do mapa (RF20): marcador vermelho com o texto "AO VIVO" nos lugares/eventos transmitindo
 * agora. Toque abre um resumo com o link para a página (onde está o player). Atualiza por polling leve
 * (só com a aba visível). Trata o próprio toque (`preventDefault`), para as outras camadas não reagirem.
 */
export function liveMapLayer({ dataUrl, pollMs }: { dataUrl: string; pollMs: number }): MapLayer {
  return {
    id: SOURCE,
    add(map: MapLibreMap, lib) {
      map.addSource(SOURCE, { type: "geojson", data: dataUrl });
      map.addLayer({
        id: HALO,
        type: "circle",
        source: SOURCE,
        paint: { "circle-color": LIVE, "circle-opacity": 0.25, "circle-radius": 18 },
      });
      map.addLayer({
        id: POINTS,
        type: "circle",
        source: SOURCE,
        paint: { "circle-color": LIVE, "circle-radius": 9, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" },
      });
      map.addLayer({
        id: LABEL,
        type: "symbol",
        source: SOURCE,
        layout: { "text-field": "AO VIVO", "text-font": MAP_FONT, "text-size": 11, "text-offset": [0, -1.9], "text-allow-overlap": true },
        paint: { "text-color": LIVE, "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });

      const popup = new lib.Popup({ closeButton: true, maxWidth: "260px", offset: 14 });
      const select = (e: MapLayerMouseEvent) => {
        e.preventDefault();
        const feature = e.features?.[0];
        if (feature?.geometry.type !== "Point") return;
        const props = feature.properties as LiveFeatureProperties;
        popup
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent(props))
          .addTo(map);
      };
      const pointer = () => (map.getCanvas().style.cursor = "pointer");
      const reset = () => (map.getCanvas().style.cursor = "");

      const subscriptions = [map.on("click", [HALO, POINTS], select), map.on("mouseenter", [HALO, POINTS], pointer), map.on("mouseleave", [HALO, POINTS], reset)];
      // Uma live que começa ou termina aparece/some sem recarregar.
      const stopPolling = pollWhileVisible(async () => {
        map.getSource<GeoJSONSource>(SOURCE)?.setData(dataUrl);
      }, pollMs);

      return () => {
        stopPolling();
        popup.remove();
        subscriptions.forEach((s) => s.unsubscribe());
      };
    },
  };
}

/** Resumo do marcador montado com textContent (nada de HTML vindo de dados). */
function popupContent(props: LiveFeatureProperties): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-1 p-1 text-sm text-black";
  const badge = document.createElement("span");
  badge.className = "self-start rounded-full bg-live px-2 py-0.5 text-xs font-semibold uppercase text-live-fg";
  badge.textContent = "Ao vivo";
  const title = document.createElement("strong");
  title.className = "text-base";
  title.textContent = props.title;
  root.append(badge, title);
  if (props.subtitle) {
    const subtitle = document.createElement("span");
    subtitle.textContent = props.subtitle;
    root.append(subtitle);
  }
  const link = document.createElement("a");
  // Só caminhos internos (o href vem do nosso servidor, mas não custa conferir).
  link.href = props.href.startsWith("/") ? props.href : "/";
  link.className = "mt-1 font-semibold text-brand underline";
  link.textContent = "Ver a live";
  root.append(link);
  return root;
}
