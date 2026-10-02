import { CalendarDays, ChevronRight, Clock, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { Badge, Card, LiveBadge } from "@/shared/ui";
import type { ResultKind, SearchHit } from "../../../domain/search";

/** Card de resultado (lugar ou evento). Sem prefetch: o detalhe é dinâmico; `Card as="div"` para o link ter nome acessível. */
export function ResultCard({ hit, kind }: { hit: SearchHit; kind: ResultKind }) {
  return (
    <Link href={hit.href} prefetch={false} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
      <Card as="div" className="flex items-center gap-3">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center self-start rounded-xl bg-surface-2 text-brand">
          {kind === "eventos" ? <CalendarDays className="size-6" /> : <Store className="size-6" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold leading-snug">{hit.title}</h3>
            {hit.badge &&
              (hit.badge.tone === "live" ? (
                <LiveBadge>{hit.badge.label}</LiveBadge>
              ) : (
                <Badge variant={hit.badge.tone} className="shrink-0">
                  {hit.badge.label}
                </Badge>
              ))}
          </div>
          {hit.when && (
            <p className="inline-flex items-center gap-1 text-sm font-medium">
              <Clock aria-hidden className="size-3.5" />
              {hit.when}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{hit.categoryLabel}</span>
            {hit.where && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {hit.where}
              </span>
            )}
          </p>
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </Card>
    </Link>
  );
}
