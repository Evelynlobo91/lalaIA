import { ArrowLeft, MapPinOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NearMeButton, PlaceListCard, RADIUS_OPTIONS_M, nearbyPlaces } from "@/modules/places";
import { ButtonLink, EmptyState, OsmAttribution, cn } from "@/shared/ui";

export const metadata: Metadata = { title: "Perto de você", robots: { index: false } };

// Depende da localização e da hora ("aberto agora").
export const dynamic = "force-dynamic";

const radiusLabel = (m: number) => (m < 1000 ? `${m} m` : `${m / 1000} km`);

export default async function PertoPage({ searchParams }: PageProps<"/lugares/perto">) {
  const params = await searchParams;
  const result = await nearbyPlaces(params);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/lugares" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Onde ir
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">Perto de você</h1>

      {!result.ok ? (
        <div className="flex flex-col gap-4">
          <EmptyState icon={MapPinOff} title="Não conseguimos usar essa localização" description={result.message} />
          <div className="flex flex-wrap gap-3">
            <NearMeButton />
            <ButtonLink href="/mapa" variant="ghost">
              Escolher no mapa
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <nav aria-label="Distância máxima" className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS_M.map((r) => {
              const active = r === result.value.radiusMeters;
              return (
                <Link
                  key={r}
                  href={`/lugares/perto?lat=${result.value.origin.lat}&lon=${result.value.origin.lon}&radius=${r}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                    active ? "border-brand bg-brand text-brand-fg" : "border-border hover:bg-surface",
                  )}
                >
                  Até {radiusLabel(r)}
                </Link>
              );
            })}
          </nav>

          {result.value.items.length === 0 ? (
            <EmptyState
              icon={MapPinOff}
              title="Nada por aqui nesse raio"
              description="Tente aumentar a distância ou escolher outro ponto no mapa."
              action={
                <ButtonLink href="/mapa" variant="secondary" size="sm">
                  Escolher no mapa
                </ButtonLink>
              }
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Lugares por distância">
              {result.value.items.map((place) => (
                <li key={place.id}>
                  <PlaceListCard place={place} />
                </li>
              ))}
            </ul>
          )}
          <OsmAttribution className="text-center" />
        </>
      )}
    </div>
  );
}
