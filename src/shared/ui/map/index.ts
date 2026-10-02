// Mapa separado do barrel de shared/ui: o MapLibre é pesado e só deve entrar nas páginas que usam mapa.
export { MapView } from "./map-view";
export type { MapLayer, MapLibreModule } from "./map-layer";
export { MapLayersContext } from "./map-layers-context";
export { JOINVILLE_CENTER, MAP_FONT } from "./base-style";
