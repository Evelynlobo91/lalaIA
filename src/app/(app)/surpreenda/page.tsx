import { Sparkles } from "lucide-react";
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
      <header className="relative flex flex-col gap-2 overflow-hidden rounded-3xl bg-brand p-5 text-brand-fg shadow-sm">
        <span
          aria-hidden
          className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_90%_10%,rgb(255_50_50/0.45),transparent_40%)]"
        />
        <Sparkles aria-hidden strokeWidth={1.25} className="absolute -right-3 -bottom-4 size-28 opacity-20" />
        <h1 className="relative text-2xl font-bold md:text-3xl">Me Surpreenda</h1>
        <p className="relative text-lg font-semibold">Seu próximo rolê começa aqui.</p>
        <p className="relative text-sm opacity-90">Deixa com a gente: {constraintsSummary(itinerary.state)}.</p>
      </header>
      {invalid && <FormAlert>{invalid} Usamos os padrões do seu perfil.</FormAlert>}
      <ConstraintsForm state={itinerary.state} basePath="/surpreenda" />
      <ItineraryView itinerary={itinerary} />
      <OsmAttribution className="text-center" />
    </div>
  );
}
