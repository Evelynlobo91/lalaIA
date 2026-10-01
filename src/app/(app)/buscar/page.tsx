import { Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { KindTabs, SearchBox, SearchResults, searchPage } from "@/modules/discovery";
import { EmptyState, OsmAttribution } from "@/shared/ui";

export const metadata: Metadata = { title: "Buscar", description: "Busque lugares e eventos de Joinville." };
// Resultados dependem do momento (eventos que já terminaram somem, "aberto agora").
export const dynamic = "force-dynamic";

// Sem loading.tsx de propósito: enquanto a pessoa digita, a página antiga continua na tela (e o foco
// fica no campo) até os novos resultados chegarem.
export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  const state = await searchPage(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Buscar</h1>
        <p className="text-muted">Lugares e eventos de Joinville, num lugar só.</p>
      </header>
      <SearchBox live defaultValue={state.q} keep={state.keep} />
      <KindTabs active={state.tipo} keep={state.q ? { q: state.q } : {}} />
      {state.status === "idle" ? (
        <EmptyState icon={SearchIcon} title={state.message} description="Ex.: “pizza”, “samba”, “museu”. Pode digitar sem acento." />
      ) : (
        <>
          <SearchResults key={state.query} results={state.results} query={state.query} />
          <OsmAttribution className="text-center" />
        </>
      )}
    </div>
  );
}
