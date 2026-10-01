import type { Metadata } from "next";
import { EventDateFilter, EventList, firstEventsPage } from "@/modules/events";
import { FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "O que fazer", description: "Shows, feiras, festas e exposições acontecendo em Joinville." };
// Depende do momento ("acontecendo agora", eventos que já terminaram somem).
export const dynamic = "force-dynamic";

export default async function EventosPage({ searchParams }: PageProps<"/eventos">) {
  const result = await firstEventsPage(await searchParams);
  const filter = result.invalid ? null : (result.filter ?? null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">O que fazer</h1>
        <p className="text-muted">Shows, feiras, festas e exposições acontecendo ou chegando em Joinville.</p>
      </header>
      <EventDateFilter active={filter} />
      {result.invalid ? (
        <FormAlert>{result.invalid} Escolha outra data.</FormAlert>
      ) : (
        <EventList
          key={result.query}
          initial={result.page}
          query={result.query}
          emptyMessage={filter ? "Nenhum evento nesse período. Tente outra data." : undefined}
        />
      )}
    </div>
  );
}
