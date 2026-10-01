import { MapPin } from "lucide-react";
import { Badge, Card } from "@/shared/ui";
import type { PlaceListItem } from "../list-places.use-case";

export function PlaceListCard({ place }: { place: PlaceListItem }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug">{place.name}</h2>
        {place.openNow !== null && <Badge variant={place.openNow ? "success" : "neutral"}>{place.openNow ? "Aberto agora" : "Fechado"}</Badge>}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <span>{place.categoryLabel}</span>
        {place.neighborhood && (
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" />
            {place.neighborhood}
          </span>
        )}
      </p>
    </Card>
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
