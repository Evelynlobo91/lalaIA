import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { MAP_FONT, type MapLayer } from "@/shared/ui/map";
import type { PlaceFeatureProperties } from "../places-geo";

export type SelectedPlace = PlaceFeatureProperties & { lat: number; lon: number };

const SOURCE = "places";
const CLUSTERS = "places-clusters";
// Camadas clicáveis (para saber se um toque caiu num lugar ou num ponto vazio do mapa).
export const PLACES_CLICKABLE_LAYERS = ["places-clusters", "places-points"];
const CLUSTER_COUNT = "places-cluster-count";
const POINTS = "places-points";

// Cores fixas (o canvas do mapa não lê variáveis CSS): azul-marinho da marca, borda clara para contraste no mapa.
const BRAND = "#02407f";
const ACCENT = "#ff3232";

/** Camada de lugares: agrupa marcadores próximos (cluster) e avisa quando um lugar é tocado. */
export function placesLayer({ dataUrl, onSelect }: { dataUrl: string; onSelect: (place: SelectedPlace) => void }): MapLayer {
  return {
    id: SOURCE,
    add(map: MapLibreMap) {
      map.addSource(SOURCE, { type: "geojson", data: dataUrl, cluster: true, clusterRadius: 48, clusterMaxZoom: 15 });

      map.addLayer({
        id: CLUSTERS,
        type: "circle",
        source: SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": BRAND,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT,
        type: "symbol",
        source: SOURCE,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": MAP_FONT, "text-size": 13 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: POINTS,
        type: "circle",
        source: SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ACCENT,
          "circle-radius": 8,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": BRAND,
        },
      });

      const zoomIntoCluster = async (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId === undefined || feature?.geometry.type !== "Point") return;
        const zoom = await map.getSource<GeoJSONSource>(SOURCE)!.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
      };

      const selectPoint = (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature?.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates;
        onSelect({ ...(feature.properties as PlaceFeatureProperties), lat, lon });
      };

      const pointer = () => (map.getCanvas().style.cursor = "pointer");
      const reset = () => (map.getCanvas().style.cursor = "");

      const subscriptions = [
        map.on("click", CLUSTERS, zoomIntoCluster),
        map.on("click", POINTS, selectPoint),
        map.on("mouseenter", [CLUSTERS, POINTS], pointer),
        map.on("mouseleave", [CLUSTERS, POINTS], reset),
      ];
      return () => subscriptions.forEach((s) => s.unsubscribe());
    },
  };
}
