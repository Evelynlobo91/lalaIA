import { Map } from "lucide-react";
import type { Metadata } from "next";
import { LiveNowList, liveNow } from "@/modules/live";
import { ButtonLink } from "@/shared/ui";

export const metadata: Metadata = { title: "Com live agora", description: "Lugares e eventos de Joinville transmitindo ao vivo agora." };
// As lives começam e terminam a qualquer momento.
export const dynamic = "force-dynamic";

export default async function AoVivoPage() {
  const items = await liveNow();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold md:text-3xl">Com live agora</h1>
          <p className="text-muted">Veja o ambiente antes de ir: lugares e eventos transmitindo neste momento.</p>
        </div>
        <ButtonLink href="/mapa" variant="secondary" prefetch={false} className="self-start">
          <Map aria-hidden className="size-5" /> Ver no mapa
        </ButtonLink>
      </header>
      <LiveNowList items={items} />
    </div>
  );
}
