import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@/shared/ui";
import type { PlaceListItem } from "../list-places.use-case";

export function PlaceListCard({ place }: { place: PlaceListItem & { distanceLabel?: string } }) {
  return (
    // Sem prefetch: a página de detalhe é dinâmica e sem loading.tsx (para responder 404 de verdade).
    // O padrão renderizaria no servidor cada card visível (10–20 consultas ao banco só por abrir a lista).
    <Link href={`/lugares/${place.id}`} prefetch={false} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
      <Card as="div" className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold leading-snug">{place.name}</h2>
            {place.openNow !== null && <Badge variant={place.openNow ? "success" : "neutral"}>{place.openNow ? "Aberto agora" : "Fechado"}</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {place.distanceLabel && <span className="font-semibold text-fg">{place.distanceLabel}</span>}
            <span>{place.categoryLabel}</span>
            {place.neighborhood && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {place.neighborhood}
              </span>
            )}
          </p>
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </Card>
    </Link>
  );
}

export function PlaceListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </ul>
  );
}
