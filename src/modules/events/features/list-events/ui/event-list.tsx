"use client";

import { CalendarX, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, FormAlert, LiveBadge } from "@/shared/ui";
import type { EventListItem, EventListPage } from "../list-events";

export function EventListCard({ event }: { event: EventListItem }) {
  // Sem prefetch: o detalhe é dinâmico (evita uma consulta por card visível).
  // Card como div dentro do link, para o link ter nome acessível.
  return (
    <Link href={`/eventos/${event.id}`} prefetch={false} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
      <Card as="div" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug">{event.title}</h2>
        {event.happeningNow ? <LiveBadge>Acontecendo</LiveBadge> : <Badge>{event.priceLabel}</Badge>}
      </div>
      <p className="text-sm font-medium">{event.whenLabel}</p>
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

/** Lista com "Carregar mais": a primeira página vem do servidor; as próximas, de /api/events. */
/** `query`: filtros da URL repassados ao "Carregar mais" (ex.: "quando=hoje"). */
export function EventList({ initial, query = "", emptyMessage }: { initial: EventListPage; query?: string; emptyMessage?: string }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Nenhum evento por enquanto"
        description={emptyMessage ?? "Quando estabelecimentos e promotores publicarem shows, feiras e festas, eles aparecem aqui."}
      />
    );
  }

  const loadMore = () =>
    startTransition(async () => {
      setError(false);
      const res = await fetch(`/api/events?cursor=${encodeURIComponent(cursor!)}${query ? `&${query}` : ""}`).catch(() => null);
      if (!res?.ok) return setError(true);
      const page = (await res.json()) as EventListPage;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Eventos">
        {items.map((e) => (
          <li key={e.id}>
            <EventListCard event={e} />
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="flex flex-col items-center gap-3">
        {error && <FormAlert>Não foi possível carregar mais eventos. Tente de novo.</FormAlert>}
        {cursor ? (
          <Button variant="secondary" onClick={loadMore} loading={pending}>
            Carregar mais
          </Button>
        ) : (
          <p className="text-sm text-muted">Esses são todos os próximos eventos.</p>
        )}
      </div>
    </div>
  );
}

export function EventListSkeleton() {
  return (
    <ul aria-hidden className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="h-[104px] animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </ul>
  );
}
