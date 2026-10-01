import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/identity";
import { LiveMapLayers } from "@/modules/live";
import { GameMapView, gameLayersParam, gameMapOf, gameStateLabels } from "@/modules/progression";

export const metadata: Metadata = { title: "Meu mapa", robots: { index: false } };
// Depende da hora (eventos acontecendo) e do que a pessoa já fez.
export const dynamic = "force-dynamic";

export default async function MeuMapaPage({ searchParams }: PageProps<"/perfil/mapa">) {
  const user = await requireUser("/perfil/mapa");
  const { camadas } = await searchParams;
  const layers = gameLayersParam.parse(typeof camadas === "string" ? camadas : undefined);
  const map = await gameMapOf(user.id);
  // Alternativa ao mapa (que é visual): os lugares com alguma situação, em lista.
  const highlighted = map.features.filter((f) => f.properties.state !== "inexplorado");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/perfil" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Perfil
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Meu mapa de exploração</h1>
        <p className="text-muted">
          Joinville como um jogo: o que você já conhece, suas missões, o que está rolando agora e o que falta explorar.
        </p>
      </header>
      <LiveMapLayers>
        <GameMapView counts={map.counts} initial={layers} />
      </LiveMapLayers>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Ver em lista ({highlighted.length} lugares)</summary>
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {highlighted.map((f) => (
            <li key={f.properties.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/lugares/${f.properties.id}`} prefetch={false} className="font-medium text-brand underline">
                {f.properties.name}
              </Link>
              <span className="text-muted">{gameStateLabels[f.properties.state]}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
