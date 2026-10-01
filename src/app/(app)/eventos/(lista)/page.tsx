import { Radio } from "lucide-react";
import type { Metadata } from "next";
import { EventCategoryFilter, EventDateFilter, EventList, firstEventsPage } from "@/modules/events";
import { ButtonLink, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "O que fazer", description: "Shows, feiras, festas e exposições acontecendo em Joinville." };
// Depende do momento ("acontecendo agora", eventos que já terminaram somem).
export const dynamic = "force-dynamic";

export default async function EventosPage({ searchParams }: PageProps<"/eventos">) {
  const result = await firstEventsPage(await searchParams);
  const { filters } = result;
  const filtered = filters.quando !== null || filters.categorias.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold md:text-3xl">O que fazer</h1>
          <p className="text-muted">Shows, feiras, festas e exposições acontecendo ou chegando em Joinville.</p>
        </div>
        <ButtonLink href="/eventos/agora" variant="secondary" prefetch={false} className="self-start">
          <Radio aria-hidden className="size-5" />
          Acontecendo agora
        </ButtonLink>
      </header>
      <div className="flex flex-col gap-3">
        <EventDateFilter filters={filters} />
        <EventCategoryFilter filters={filters} />
      </div>
      {result.invalid ? (
        <FormAlert>{result.invalid} Ajuste os filtros.</FormAlert>
      ) : (
        <EventList
          key={result.query}
          initial={result.page}
          query={result.query}
          emptyMessage={filtered ? "Nenhum evento com esses filtros. Tente outra data ou categoria." : undefined}
        />
      )}
    </div>
  );
}
