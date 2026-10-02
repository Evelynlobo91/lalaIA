import { Footprints, Sparkles, Wallet } from "lucide-react";
import { EmptyState } from "@/shared/ui";
import { RecommendationCard } from "../../rec-score/ui/recommendation-card";
import type { Itinerary } from "../surprise-me.use-case";

/** RF42 — Roteiro em linha do tempo: cada parada com deslocamento, justificativa e custo. */
export function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  if (itinerary.stops.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Não achamos um roteiro com essas escolhas"
        description="Tente mais tempo, um orçamento maior ou outro tipo de experiência."
      />
    );
  }

  return (
    <section aria-labelledby="roteiro" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="roteiro" className="text-lg font-semibold">
          Seu roteiro
        </h2>
        <p className="inline-flex items-center gap-1 text-sm text-muted">
          <Wallet aria-hidden className="size-4" />
          Custo estimado: <strong className="text-fg">{itinerary.totalCostLabel}</strong>
        </p>
      </div>
      <ol aria-labelledby="roteiro" className="flex flex-col gap-4">
        {itinerary.stops.map((stop) => (
          <li key={stop.item.key} aria-label={`Parada ${stop.order}: ${stop.item.title}`} className="flex gap-3">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">
              {stop.order}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="inline-flex items-center gap-1 text-sm text-muted">
                <Footprints aria-hidden className="size-4" />
                {stop.travel}
              </p>
              <RecommendationCard item={stop.item} />
              <p className="text-sm">
                <span className="font-medium">Por quê:</span> {stop.why} · <span className="font-medium">Custo:</span> {stop.costLabel}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        {itinerary.source === "claude" ? "Roteiro montado com IA a partir do que está rolando agora." : "Roteiro montado com o que está rolando agora."} Valores
        são estimativas; confira no local.
      </p>
    </section>
  );
}
