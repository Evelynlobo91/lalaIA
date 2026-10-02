import type { StyleSpecification } from "maplibre-gl";

/** Centro de Joinville (Praça Nereu Ramos). */
export const JOINVILLE_CENTER: [number, number] = [-48.8456, -26.3045];

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

/**
 * Estilo base. Se NEXT_PUBLIC_MAP_STYLE_URL estiver definido (ex.: MapTiler/Stadia), usamos esse estilo vetorial.
 * Senão, os tiles raster públicos do OpenStreetMap: bons para a POC, mas a política de uso deles
 * não comporta tráfego de produção (veja docs/places-data.md).
 */
export function baseStyle(): StyleSpecification | string {
  const custom = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (custom) return custom;
  return {
    version: 8,
    // Fontes para textos das camadas (ex.: número de lugares no cluster), servidas pela MapLibre.
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

/** Fonte usada nos textos das camadas (precisa existir no servidor de glyphs do estilo). */
export const MAP_FONT = ["Noto Sans Bold"];
