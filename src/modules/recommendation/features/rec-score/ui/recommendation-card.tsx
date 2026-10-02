import { ChevronRight, Clock, MapPin, Navigation, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge, Card, LiveBadge, cn } from "@/shared/ui";
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

/** Destaque do topo do feed: card grande em azul, para o que está ao vivo agora. */
export function FeaturedRecommendationCard({ item }: { item: RecommendationItem }) {
  const meta = [item.categoryLabel, item.distanceLabel, item.timeLabel].filter(Boolean).join(" · ");
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="relative flex min-h-48 flex-col justify-end gap-2 overflow-hidden rounded-3xl bg-brand p-5 text-brand-fg shadow-sm transition hover:-translate-y-0.5"
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_85%_15%,rgb(255_50_50/0.45),transparent_40%),radial-gradient(circle_at_10%_100%,rgb(255_255_255/0.18),transparent_45%)]"
      />
      {item.live && <LiveBadge className="absolute top-4 left-4" />}
      <span className="relative text-xs font-semibold uppercase tracking-wide opacity-85">
        {recommendationKindLabel(item.kind)}
        {item.placeName ? ` · ${item.placeName}` : ""}
      </span>
      <h3 className="relative text-2xl leading-tight font-bold">{item.title}</h3>
      {meta && <p className="relative text-sm opacity-90">{meta}</p>}
    </Link>
  );
}

/**
 * Lista ranqueada (a ordem é a do score). Com `featureLive`, o primeiro item ao vivo sobe para o
 * destaque, mas continua na mesma lista (leitor de tela ouve a ordem e o total corretos).
 */
export function RecommendationList({ items, label, featureLive = false }: { items: RecommendationItem[]; label: string; featureLive?: boolean }) {
  const featured = featureLive && items[0]?.live ? items[0] : null;
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key} className={cn(item === featured && "sm:col-span-2")}>
          {item === featured ? <FeaturedRecommendationCard item={item} /> : <RecommendationCard item={item} />}
        </li>
      ))}
    </ol>
  );
}
