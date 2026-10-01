import type { Metadata } from "next";
import { LiveMapLayers } from "@/modules/live";
import { PlacesMap, mapFocus } from "@/modules/places";

export const metadata: Metadata = { title: "Mapa", description: "Lugares de Joinville e lives no ar, no mapa." };

export default async function MapaPage({ searchParams }: PageProps<"/mapa">) {
  const { lugar } = await searchParams;
  const focus = await mapFocus(typeof lugar === "string" ? lugar : undefined);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only md:not-sr-only md:text-3xl md:font-bold">Mapa</h1>
      {/* Altura: tela inteira menos cabeçalho/navegação (celular) ou título (desktop). */}
      <div className="-mx-4 h-[calc(100dvh-10.5rem)] min-h-80 md:mx-0 md:h-[calc(100dvh-10rem)]">
        {/* Camadas somadas: lugares (do próprio PlacesMap) + lives no ar. */}
        <LiveMapLayers>
          <PlacesMap focus={focus} />
        </LiveMapLayers>
      </div>
    </div>
  );
}
