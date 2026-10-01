"use client";

import { Radio } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { ButtonLink } from "@/shared/ui";
import { MapLayersContext } from "@/shared/ui/map";
import { LIVE_NOW_POLL_MS } from "../live-badge.schema";
import { liveMapLayer } from "./live-map-layer";

/**
 * Soma a camada "lives" ao mapa que estiver dentro (`MapLayersContext`): o mapa de lugares não conhece o
 * módulo live. Como o mapa é visual, há também o link para a lista "Com live agora".
 */
export function LiveMapLayers({ children }: { children: ReactNode }) {
  const layers = useMemo(() => [liveMapLayer({ dataUrl: "/api/live/map", pollMs: LIVE_NOW_POLL_MS })], []);
  return (
    <MapLayersContext.Provider value={layers}>
      <div className="relative h-full">
        {children}
        <ButtonLink href="/ao-vivo" variant="secondary" size="sm" prefetch={false} className="absolute left-3 top-14 shadow-md">
          <Radio aria-hidden className="size-4 text-live" /> Com live agora
        </ButtonLink>
      </div>
    </MapLayersContext.Provider>
  );
}
