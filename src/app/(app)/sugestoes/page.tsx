import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { ConstraintsForm, RecommendationList, constrainedRecommendations, constraintsSummary } from "@/modules/recommendation";
import { EmptyState, FormAlert, OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Sugestões pra você",
  description: "Diga quanto tempo e quanto quer gastar: sugestões do que fazer agora em Joinville.",
  // Depende da localização e do perfil: não indexar.
  robots: { index: false },
};
// Depende da hora, da sessão e da localização.
export const dynamic = "force-dynamic";

export default async function SugestoesPage({ searchParams }: PageProps<"/sugestoes">) {
  const { invalid, state, items } = await constrainedRecommendations(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Sugestões pra você</h1>
        <p className="text-muted">Ajuste em poucos toques. Já começamos com o que está no seu perfil.</p>
      </header>
      {invalid && <FormAlert>{invalid} Mostrando com os padrões do seu perfil.</FormAlert>}

      <ConstraintsForm state={state} />

      <section aria-labelledby="resultado" className="flex flex-col gap-3">
        <h2 id="resultado" className="text-lg font-semibold">
          {items.length > 0 ? `${items.length} ${items.length === 1 ? "sugestão" : "sugestões"}` : "Sugestões"}{" "}
          <span className="text-sm font-normal text-muted">({constraintsSummary(state)})</span>
        </h2>
        {items.length === 0 ? (
          <EmptyState icon={SearchX} title="Nada cabe nessas restrições agora" description="Tente mais tempo, um orçamento maior ou outro tipo de experiência." />
        ) : (
          <RecommendationList items={items} label="Sugestões ordenadas para você" />
        )}
      </section>
      <OsmAttribution className="text-center" />
    </div>
  );
}
