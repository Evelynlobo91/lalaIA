import { ChevronRight, Clock, MapPin, Navigation, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge, Card, LiveBadge } from "@/shared/ui";
import { recommendationKindLabel, type RecommendationItem } from "../recommendation-item";

/** Card de uma sugestão: o quê, quando, onde, quanto e POR QUÊ (até 2 motivos). */
export function RecommendationCard({ item }: { item: RecommendationItem }) {
  const where = [item.placeName, item.neighborhood].filter(Boolean).join(" · ");
  // Sem prefetch (detalhe dinâmico) e Card como div dentro do link (nome acessível).
  return (
    <Link href={item.href} prefetch={false} className="block h-full rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
      <Card as="div" className="flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {recommendationKindLabel(item.kind)}
              {item.categoryLabel ? ` · ${item.categoryLabel}` : ""}
            </span>
            {/* Destaque pago sempre sinalizado, mesmo quando outros motivos pesam mais. */}
            {item.sponsored && <span className="text-xs font-semibold text-muted">Patrocinado</span>}
            <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          </div>
          {item.live ? <LiveBadge /> : item.priceLabel && <Badge>{item.priceLabel}</Badge>}
        </div>

        {item.reasons.length > 0 && (
          <ul aria-label="Por que sugerimos" className="flex flex-wrap gap-1.5">
            {item.reasons.slice(0, 2).map((reason) => (
              <li key={reason}>
                <Badge variant="accent">
                  <Sparkles aria-hidden className="size-3" />
                  {reason}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {item.timeLabel && (
            <span className="inline-flex items-center gap-1 font-medium">
              <Clock aria-hidden className="size-4 text-brand" />
              {item.timeLabel}
            </span>
          )}
          {item.distanceLabel && (
            <span className="inline-flex items-center gap-1 font-medium">
              <Navigation aria-hidden className="size-4 text-brand" />
              <span>
                {item.distanceLabel} <span className="sr-only">de você</span>
              </span>
            </span>
          )}
          {where && (
            <span className="inline-flex items-center gap-1 text-muted">
              <MapPin aria-hidden className="size-3.5" />
              {where}
            </span>
          )}
          <ChevronRight aria-hidden className="ml-auto size-5 text-muted" />
        </p>
      </Card>
    </Link>
  );
}

/** Lista ranqueada (a ordem é a do score). */
export function RecommendationList({ items, label }: { items: RecommendationItem[]; label: string }) {
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key}>
          <RecommendationCard item={item} />
        </li>
      ))}
    </ol>
  );
}
