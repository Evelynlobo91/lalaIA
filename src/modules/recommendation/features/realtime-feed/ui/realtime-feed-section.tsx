import { CalendarClock, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { NearMeButton } from "@/modules/places";
import { ButtonLink, EmptyState, FormAlert } from "@/shared/ui";
import { RecommendationList } from "../../rec-score/ui/recommendation-card";
import type { RealtimeFeedView } from "../realtime-feed.use-case";
import { FeedAutoRefresh } from "./feed-auto-refresh";

/**
 * RF37 — Seção "Agora perto de você" (home): feed ordenado pelo score, com distância, há quanto tempo
 * começou e selo Live. Atualiza sozinha a cada minuto.
 */
export function RealtimeFeedSection({ view, invalid, origin }: { view: RealtimeFeedView; invalid: string | null; origin: { lat: number; lon: number } | null }) {
  const adjust = origin ? `/sugestoes?lat=${origin.lat}&lon=${origin.lon}` : "/sugestoes";
  return (
    <section aria-labelledby="agora-perto" className="flex flex-col gap-3">
      <FeedAutoRefresh />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="agora-perto" className="text-xl font-bold">
            {view.nearMe ? "Agora perto de você" : "Agora em Joinville"}
          </h2>
          <p className="text-sm text-muted">
            {view.nearMe ? "Acontecendo agora ou nas próximas 3 horas, do que mais combina com você." : "O que está rolando agora e nas próximas 3 horas. Use sua localização para ver o que está perto."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!view.nearMe && <NearMeButton target="/" label="Ver o que está perto" />}
          <Link href={adjust} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand underline">
            <SlidersHorizontal aria-hidden className="size-4" /> Ajustar tempo e orçamento
          </Link>
        </div>
      </div>
      {invalid && <FormAlert>{invalid} Mostrando sem distância.</FormAlert>}
      {view.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={view.nearMe ? "Nada rolando perto de você agora" : "Joinville está tranquila agora"}
          description="Veja a agenda completa ou ajuste o tempo e o orçamento."
          action={
            <ButtonLink href="/eventos" variant="secondary" size="sm">
              Ver eventos
            </ButtonLink>
          }
        />
      ) : (
        <RecommendationList items={view.items} label={view.nearMe ? "Agora perto de você" : "Agora em Joinville"} />
      )}
    </section>
  );
}
