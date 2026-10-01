import { ChevronRight, Clock, MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, EmptyState, LiveBadge } from "@/shared/ui";
import type { HappeningItem, HappeningNowView } from "../happening-now.use-case";

function HappeningCard({ event, live }: { event: HappeningItem; live: boolean }) {
  // Sem prefetch (detalhe dinâmico) e Card como div dentro do link (nome acessível).
  return (
    <Link href={`/eventos/${event.id}`} prefetch={false} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
      <Card as="div" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">{event.title}</h3>
          {live ? <LiveBadge>Agora</LiveBadge> : <Badge>{event.priceLabel}</Badge>}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-4 text-brand" />
            {event.timeLabel}
          </span>
          {event.distanceLabel && (
            <span className="inline-flex items-center gap-1">
              <Navigation aria-hidden className="size-4 text-brand" />
              <span>
                {event.distanceLabel} <span className="sr-only">de você</span>
              </span>
            </span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{event.categoryLabel}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" />
            {event.placeName}
            {event.neighborhood ? ` · ${event.neighborhood}` : ""}
          </span>
          <ChevronRight aria-hidden className="ml-auto size-5 text-muted" />
        </p>
      </Card>
    </Link>
  );
}

function Section({ id, title, items, live, empty }: { id: string; title: string; items: HappeningItem[]; live: boolean; empty: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        empty
      ) : (
        <ul aria-labelledby={id} className="grid gap-3 sm:grid-cols-2">
          {items.map((e) => (
            <li key={e.id}>
              <HappeningCard event={e} live={live} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** RF17/RF40 — Seções "Agora" e "Em breve (próximas 3 h)". */
export function HappeningNowSections({ view }: { view: HappeningNowView }) {
  return (
    <div className="flex flex-col gap-8">
      <Section
        id="agora"
        title="Agora"
        items={view.now}
        live
        empty={<p className="text-muted">Nada acontecendo neste momento.</p>}
      />
      <Section
        id="em-breve"
        title="Em breve (próximas 3h)"
        items={view.soon}
        live={false}
        empty={
          view.now.length === 0 ? (
            <EmptyState title="Joinville está tranquila agora" description="Veja a agenda completa para os próximos dias." />
          ) : (
            <p className="text-muted">Nada começando nas próximas 3 horas.</p>
          )
        }
      />
    </div>
  );
}
