import type { Metadata } from "next";
import { ConstraintsForm, ItineraryView, constraintsSummary, surpriseItinerary } from "@/modules/recommendation";
import { FormAlert, OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Me Surpreenda",
  description: "Diga quanto tempo e quanto quer gastar, e a gente monta um roteiro com o que está rolando agora em Joinville.",
};
// O roteiro depende do momento, da sessão e da localização.
export const dynamic = "force-dynamic";

export default async function SurpreendaPage({ searchParams }: PageProps<"/surpreenda">) {
  const params = await searchParams;
  const { invalid, itinerary } = await surpriseItinerary(params);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Me Surpreenda</h1>
        <p className="text-muted">Deixa com a gente: {constraintsSummary(itinerary.state)}.</p>
      </header>
      {invalid && <FormAlert>{invalid} Usamos os padrões do seu perfil.</FormAlert>}
      <ConstraintsForm state={itinerary.state} basePath="/surpreenda" />
      <ItineraryView itinerary={itinerary} />
      <OsmAttribution className="text-center" />
    </div>
  );
}
