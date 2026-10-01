import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HappeningNowSections, happeningNowView } from "@/modules/events";
import { NearMeButton } from "@/modules/places";
import { FormAlert } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Acontecendo agora",
  description: "O que está rolando agora em Joinville e o que começa nas próximas 3 horas.",
};
// Muda a cada minuto ("começou há 25 min").
export const dynamic = "force-dynamic";

export default async function AgoraPage({ searchParams }: PageProps<"/eventos/agora">) {
  const { invalid, view } = await happeningNowView(await searchParams);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/eventos" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> O que fazer
      </Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold md:text-3xl">Acontecendo agora</h1>
          <p className="text-muted">
            {view.nearMe ? "Do mais perto para o mais longe de você." : "O que está rolando em Joinville e o que começa nas próximas 3 horas."}
          </p>
        </div>
        {!view.nearMe && <NearMeButton target="/eventos/agora" label="Ver distância" />}
      </header>
      {invalid && <FormAlert>{invalid} Mostrando sem distância.</FormAlert>}
      <HappeningNowSections view={view} />
    </div>
  );
}
