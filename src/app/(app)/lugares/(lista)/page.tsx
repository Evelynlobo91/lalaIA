import { RadioTower } from "lucide-react";
import type { Metadata } from "next";
import { LiveNowProvider, liveNowKeys } from "@/modules/live";
import { NearMeButton, PlaceList, firstPlacesPage } from "@/modules/places";
import { ButtonLink, OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = { title: "Onde ir", description: "Restaurantes, bares, cultura, parques e passeios em Joinville." };

// "Aberto agora" depende da hora: a página é sempre gerada na hora da visita.
export const dynamic = "force-dynamic";

export default async function LugaresPage() {
  const [initial, live] = await Promise.all([firstPlacesPage(), liveNowKeys()]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold md:text-3xl">Onde ir</h1>
          <p className="text-muted">Restaurantes, bares, cultura, parques e passeios de Joinville.</p>
        </div>
        <ButtonLink href="/ao-vivo" variant="secondary" prefetch={false} className="self-start">
          <RadioTower aria-hidden className="size-5" /> Com live agora
        </ButtonLink>
      </header>
      <NearMeButton />
      {/* Selo "Ao vivo" nos cards: o provider da Live fornece as lives no ar (places não conhece o módulo). */}
      <LiveNowProvider initial={live}>
        <PlaceList initial={initial} />
      </LiveNowProvider>
      <OsmAttribution className="text-center" />
    </div>
  );
}
