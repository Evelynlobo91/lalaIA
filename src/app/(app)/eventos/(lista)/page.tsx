import { Radio, RadioTower } from "lucide-react";
import type { Metadata } from "next";
import { EventCategoryFilter, EventDateFilter, EventList, firstEventsPage } from "@/modules/events";
import { LiveNowProvider, liveNowKeys } from "@/modules/live";
import { ButtonLink, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "O que fazer", description: "Shows, feiras, festas e exposições acontecendo em Joinville." };
// Depende do momento ("acontecendo agora", eventos que já terminaram somem).
export const dynamic = "force-dynamic";

export default async function EventosPage({ searchParams }: PageProps<"/eventos">) {
  const [result, live] = await Promise.all([searchParams.then(firstEventsPage), liveNowKeys()]);
  const { filters } = result;
  const filtered = filters.quando !== null || filters.categorias.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold md:text-3xl">O que fazer</h1>
          <p className="text-muted">Shows, feiras, festas e exposições acontecendo ou chegando em Joinville.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <ButtonLink href="/eventos/agora" variant="secondary" prefetch={false}>
            <Radio aria-hidden className="size-5" />
            Acontecendo agora
          </ButtonLink>
          <ButtonLink href="/ao-vivo" variant="secondary" prefetch={false}>
            <RadioTower aria-hidden className="size-5" /> Com live agora
          </ButtonLink>
        </div>
      </header>
      <div className="flex flex-col gap-3">
        <EventDateFilter filters={filters} />
        <EventCategoryFilter filters={filters} />
      </div>
      {result.invalid ? (
        <FormAlert>{result.invalid} Ajuste os filtros.</FormAlert>
      ) : (
        <LiveNowProvider initial={live}>
          <EventList
            key={result.query}
            initial={result.page}
            query={result.query}
            emptyMessage={filtered ? "Nenhum evento com esses filtros. Tente outra data ou categoria." : undefined}
          />
        </LiveNowProvider>
      )}
    </div>
  );
}
