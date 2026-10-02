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
    <section aria-labelledby="roteiro" className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-accent">Surpresa perfeita</p>
        <h2 id="roteiro" className="text-xl font-bold">
          Seu roteiro
        </h2>
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-surface-2 px-3 py-2">
            <dt className="text-xs text-muted">Paradas</dt>
            <dd className="font-bold">{itinerary.stops.length}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 px-3 py-2">
            <dt className="inline-flex items-center gap-1 text-xs text-muted">
              <Wallet aria-hidden className="size-3.5" /> Custo estimado:
            </dt>
            <dd className="font-bold">{itinerary.totalCostLabel}</dd>
          </div>
        </dl>
      </div>
      {/* Linha do tempo: a linha vertical liga os números das paradas. */}
      <ol aria-labelledby="roteiro" className="relative flex flex-col gap-5 before:absolute before:top-4 before:bottom-4 before:left-4 before:w-0.5 before:-translate-x-1/2 before:bg-border">
        {itinerary.stops.map((stop) => (
          <li key={stop.item.key} aria-label={`Parada ${stop.order}: ${stop.item.title}`} className="relative flex gap-3">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg ring-4 ring-surface">
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
