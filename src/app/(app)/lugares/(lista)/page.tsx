import type { Metadata } from "next";
import { NearMeButton, PlaceList, firstPlacesPage } from "@/modules/places";
import { OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = { title: "Onde ir", description: "Restaurantes, bares, cultura, parques e passeios em Joinville." };

// "Aberto agora" depende da hora: a página é sempre gerada na hora da visita.
export const dynamic = "force-dynamic";

export default async function LugaresPage() {
  const initial = await firstPlacesPage();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Onde ir</h1>
        <p className="text-muted">Restaurantes, bares, cultura, parques e passeios de Joinville.</p>
      </header>
      <NearMeButton />
      <PlaceList initial={initial} />
      <OsmAttribution className="text-center" />
    </div>
  );
}
