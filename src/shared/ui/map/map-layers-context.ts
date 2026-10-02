"use client";

import { createContext } from "react";
import type { MapLayer } from "./map-layer";

/**
 * Camadas extras fornecidas por quem envolve o mapa (ex.: a camada Live, somada na página /mapa).
 * O MapView soma estas às suas `layers`, sem saber de onde vêm. O valor precisa ser estável (useMemo).
 * Quem trata o toque nos próprios marcadores chama `e.preventDefault()`, e as outras camadas conferem
 * `e.defaultPrevented` para não reagir ao mesmo toque.
 */
export const MapLayersContext = createContext<readonly MapLayer[]>([]);
