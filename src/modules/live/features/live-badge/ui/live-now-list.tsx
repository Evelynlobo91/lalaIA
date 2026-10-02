import { CalendarDays, ChevronRight, MapPin, RadioTower } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/shared/time/joinville-time";
import { Card, EmptyState, LiveBadge } from "@/shared/ui";
import type { LiveNowItem } from "../live-badge.use-case";

/** Lista "Com live agora" (RF20): lugares e eventos transmitindo, com link para a página do player. */
export function LiveNowList({ items }: { items: LiveNowItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={RadioTower}
        title="Nenhuma live no ar agora"
        description="Quando um bar, restaurante ou evento começar a transmitir, ele aparece aqui. Esta lista se atualiza ao recarregar."
      />
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Com live agora">
      {items.map((item) => (
        <li key={item.streamId}>
          {/* Sem prefetch: o detalhe é dinâmico (evita uma consulta por card visível). */}
          <Link href={item.href} prefetch={false} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
            <Card as="div" className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-snug">{item.title}</h2>
                  <LiveBadge className="shrink-0" />
                </div>
                {item.whenLabel && <p className="text-sm font-medium">{item.whenLabel}</p>}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1">
                    {item.entityType === "place" ? <MapPin aria-hidden className="size-3.5" /> : <CalendarDays aria-hidden className="size-3.5" />}
                    {item.entityType === "place" ? "Lugar" : "Evento"}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </span>
                  <span>No ar desde {formatTime(item.liveSince)}</span>
                </p>
                {item.note && (
                  <p className="text-sm">
                    <span className="font-semibold">Agora:</span> {item.note}
                  </p>
                )}
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
