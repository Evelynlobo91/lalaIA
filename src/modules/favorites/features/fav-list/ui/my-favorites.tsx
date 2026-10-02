import { CalendarHeart, HeartOff, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, ButtonLink, Card, EmptyState, LiveBadge, cn } from "@/shared/ui";
import type { FavoriteTab } from "../fav-list.schema";
import type { EventTiming, MyFavoriteEvent, MyFavoritePlace, MyFavorites } from "../fav-list.use-case";
import { RemoveFavoriteButton } from "./remove-favorite-button";

const tabs: Array<{ id: FavoriteTab; label: string }> = [
  { id: "lugares", label: "Lugares" },
  { id: "eventos", label: "Eventos" },
];

/** RF08 — Lista "Meus favoritos" com abas Lugares / Eventos (links: funcionam sem JavaScript). */
export function MyFavoritesView({ favorites, tab }: { favorites: MyFavorites; tab: FavoriteTab }) {
  const counts = { lugares: favorites.places.length, eventos: favorites.events.length };
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Tipo de favorito">
        <ul className="flex gap-2">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <Link
                  href={`/perfil/favoritos?aba=${t.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-xl px-4 font-semibold transition",
                    active ? "bg-brand text-brand-fg" : "bg-surface-2 text-fg hover:bg-border",
                  )}
                >
                  {t.label}
                  <span className="text-sm font-normal">({counts[t.id]})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "lugares" ? <PlaceSection places={favorites.places} /> : <EventSection events={favorites.events} />}
    </div>
  );
}

function PlaceSection({ places }: { places: MyFavoritePlace[] }) {
  if (places.length === 0) {
    return (
      <EmptyState
        icon={HeartOff}
        title="Nenhum lugar favorito ainda"
        description="Toque em “Favoritar” na página de um lugar para guardá-lo aqui."
        action={<ButtonLink href="/lugares">Explorar lugares</ButtonLink>}
      />
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Lugares favoritos">
      {places.map((p) => (
        <li key={p.id}>
          <Card className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-base font-semibold leading-snug">
                <Link href={`/lugares/${p.id}`} prefetch={false} className="hover:underline">
                  {p.name}
                </Link>
              </h2>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                <span>{p.categoryLabel}</span>
                {p.neighborhood && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="size-3.5" />
                    {p.neighborhood}
                  </span>
                )}
              </p>
            </div>
            <RemoveFavoriteButton entityType="place" entityId={p.id} name={p.name} />
          </Card>
        </li>
      ))}
    </ul>
  );
}

const timingBadge: Record<EventTiming, ReactNode> = {
  upcoming: null,
  happening: <LiveBadge>Acontecendo</LiveBadge>,
  ended: <Badge>Encerrado</Badge>,
  cancelled: <Badge variant="danger">Cancelado</Badge>,
};

function EventSection({ events }: { events: MyFavoriteEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarHeart}
        title="Nenhum evento favorito ainda"
        description="Favorite shows, feiras e festas para não perder a data."
        action={<ButtonLink href="/eventos">Ver o que fazer</ButtonLink>}
      />
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Eventos favoritos">
      {events.map((e) => {
        const over = e.timing === "ended" || e.timing === "cancelled";
        return (
          <li key={e.id}>
            <Card className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold leading-snug">
                    <Link href={`/eventos/${e.id}`} prefetch={false} className="hover:underline">
                      {e.title}
                    </Link>
                  </h2>
                  {timingBadge[e.timing]}
                </div>
                <p className={cn("text-sm font-medium", over && "text-muted")}>{e.whenLabel}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span>{e.categoryLabel}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="size-3.5" />
                    {e.placeName}
                    {e.neighborhood ? ` · ${e.neighborhood}` : ""}
                  </span>
                </p>
              </div>
              <RemoveFavoriteButton entityType="event" entityId={e.id} name={e.title} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
