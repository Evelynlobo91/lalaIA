import { CalendarDays, MapPin, Navigation, Ticket } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, FormAlert, LiveBadge, buttonClasses } from "@/shared/ui";
import type { EventDetailView } from "../event-detail";

/**
 * Detalhe do evento. `extras` é o ponto de extensão para outros módulos
 * (ex.: favoritar, selo e player da Live) sem que este componente os conheça.
 * `directions` substitui o botão "Como chegar" (ex.: "Quero ir" de favorites);
 * só aparece quando o evento tem lugar e ainda não terminou nem foi cancelado.
 */
export function EventDetailCard({ event, extras, directions }: { event: EventDetailView; extras?: ReactNode; directions?: ReactNode }) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">{event.categoryLabel}</Badge>
          {event.phase === "happening" && <LiveBadge>Acontecendo agora</LiveBadge>}
          {event.phase === "finished" && <Badge>Encerrado</Badge>}
          {event.phase === "cancelled" && <Badge variant="danger">Cancelado</Badge>}
        </div>
        <h1 className="text-3xl font-bold leading-tight">{event.title}</h1>
      </header>

      {event.phase === "cancelled" && <FormAlert>Este evento foi cancelado pelo organizador.</FormAlert>}

      {extras}

      {event.place && event.phase !== "cancelled" && event.phase !== "finished" && (directions ?? (
        <a href={event.place.directionsUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "lg", fullWidth: true }, "sm:w-auto sm:self-start")}>
          <Navigation aria-hidden className="size-5" />
          Como chegar
        </a>
      ))}

      <Card className="flex flex-col divide-y divide-border p-0">
        <Info icon={<CalendarDays aria-hidden className="size-5" />} label="Quando">
          {event.whenLabel}
        </Info>
        <Info icon={<MapPin aria-hidden className="size-5" />} label="Onde">
          {event.place ? (
            <>
              <Link href={`/lugares/${event.place.id}`} prefetch={false} className="font-medium text-brand underline">
                {event.place.name}
              </Link>
              {event.place.address && <span className="text-sm text-muted">{event.place.address}</span>}
            </>
          ) : (
            <span className="text-muted">Local a confirmar</span>
          )}
        </Info>
        <Info icon={<Ticket aria-hidden className="size-5" />} label="Valor">
          {event.priceLabel}
        </Info>
      </Card>

      <section aria-labelledby="sobre" className="flex flex-col gap-2">
        <h2 id="sobre" className="text-lg font-semibold">
          Sobre o evento
        </h2>
        <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
      </section>
    </article>
  );
}

function Info({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 px-4 py-4" aria-label={label}>
      <span className="mt-0.5 text-brand">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <h2 className="text-sm font-medium text-muted">{label}</h2>
        <div className="flex flex-col">{children}</div>
      </div>
    </section>
  );
}
