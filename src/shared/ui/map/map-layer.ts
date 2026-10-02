import type { Map as MapLibreMap } from "maplibre-gl";

export type MapLibreModule = typeof import("maplibre-gl");

/**
 * Camada plugável do mapa (OCP): cada módulo (lugares, eventos, missões, live) fornece a sua,
 * e o MapView só sabe adicioná-las e removê-las. O "mapa como jogo" é a soma de várias camadas.
 */
export interface MapLayer {
  /** Identificador único (prefixo para os ids de source/layer do MapLibre). */
  id: string;
  /**
   * Adiciona sources, layers e eventos. Pode devolver uma função de limpeza. `lib` é o próprio maplibre-gl,
   * carregado sob demanda pelo MapView: as camadas não o importam (só `import type`), para ele não entrar no
   * JavaScript das páginas sem mapa.
   */
  add(map: MapLibreMap, lib: MapLibreModule): void | (() => void);
}
