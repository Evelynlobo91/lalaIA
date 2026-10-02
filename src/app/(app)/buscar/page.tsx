import { Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { ActiveFilters, KindTabs, SearchBox, SearchFilters, SearchResults, filterOptions, searchPage } from "@/modules/discovery";
import { EmptyState, FormAlert, OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = { title: "Explorar", description: "Busque lugares e eventos de Joinville." };
// Resultados dependem do momento (eventos que já terminaram somem, "aberto agora").
export const dynamic = "force-dynamic";

// Sem loading.tsx de propósito: enquanto a pessoa digita, a página antiga continua na tela (e o foco
// fica no campo) até os novos resultados chegarem.
export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  const [state, options] = await Promise.all([searchPage(await searchParams), filterOptions()]);
  const keepForText: Record<string, string> = { ...(state.tipo && { tipo: state.tipo }), ...state.filters };
  const keepForFilters: Record<string, string> = { ...(state.q && { q: state.q }), ...(state.tipo && { tipo: state.tipo }) };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Explorar</h1>
        <p className="text-muted">Descubra o que fazer em Joinville: lugares e eventos num lugar só.</p>
      </header>
      <SearchBox live defaultValue={state.q} keep={keepForText} />
      <KindTabs active={state.tipo} keep={{ ...(state.q && { q: state.q }), ...state.filters }} />
      <SearchFilters key={state.query} options={options} active={state.filters} keep={keepForFilters} />
      <ActiveFilters chips={state.chips} clearHref={state.clearHref} />
      {state.status === "idle" ? (
        state.invalid ? (
          <FormAlert>{state.message} Ajuste os filtros.</FormAlert>
        ) : (
          <EmptyState icon={SearchIcon} title={state.message} description="Ex.: “pizza”, “samba”, “museu”. Pode digitar sem acento." />
        )
      ) : (
        <>
          <SearchResults key={state.query} results={state.results} query={state.query} />
          <OsmAttribution className="text-center" />
        </>
      )}
    </div>
  );
}

