import { Clock, ExternalLink, Globe, MapPin, Navigation, Phone, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, DetailHero, Eyebrow, InfoItem as Info, LiveNowBadge, OsmAttribution, buttonClasses, cn } from "@/shared/ui";
import type { PlaceDetailView } from "../place-detail.use-case";

/**
 * Detalhe de um lugar. `extras` é o ponto de extensão para outros módulos
 * (ex.: selo e player da Live, eventos do lugar) sem que este componente os conheça.
 * `directions` substitui o botão padrão "Como chegar" (ex.: o "Quero ir" de favorites, que registra o clique).
 */
export function PlaceDetailCard({ place, extras, directions }: { place: PlaceDetailView; extras?: ReactNode; directions?: ReactNode }) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <DetailHero icon={Store}>
          <LiveNowBadge entityType="place" entityId={place.id} />
          {place.openNow !== null && <Badge variant={place.openNow ? "success" : "neutral"}>{place.openNow ? "Aberto agora" : "Fechado agora"}</Badge>}
        </DetailHero>
        <div className="flex flex-col gap-1">
          <Eyebrow>{place.categoryLabel}</Eyebrow>
          <h1 className="text-3xl font-bold leading-tight">{place.name}</h1>
          {place.neighborhood && <p className="text-muted">{place.neighborhood}, Joinville</p>}
        </div>
      </header>

      {extras}

      {directions ?? (
        <a href={place.directionsUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "lg", fullWidth: true }, "sm:w-auto sm:self-start")}>
          <Navigation aria-hidden className="size-5" />
          Como chegar
        </a>
      )}

      <Card className="flex flex-col divide-y divide-border p-0">
        <Info icon={<MapPin aria-hidden />} label="Endereço">
          {place.address ?? <span className="text-muted">Endereço não informado</span>}
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href={`/mapa?lugar=${place.id}`} className="text-brand underline">
              Ver no mapa
            </Link>
            <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted underline">
              Abrir no OpenStreetMap <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </span>
        </Info>

        {place.phones.length > 0 && (
          <Info icon={<Phone aria-hidden />} label="Telefone">
            {place.phones.map((phone) =>
              phone.href ? (
                <a key={phone.label} href={phone.href} className="text-brand underline">
                  {phone.label}
                </a>
              ) : (
                <span key={phone.label}>{phone.label}</span>
              ),
            )}
          </Info>
        )}

        {place.website && (
          <Info icon={<Globe aria-hidden />} label="Site">
            <a href={place.website} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand underline">
              {place.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          </Info>
        )}

        {(place.weeklyHours || place.rawHours) && (
          <Info icon={<Clock aria-hidden />} label="Horário de funcionamento">
            {place.weeklyHours ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
                {place.weeklyHours.map(({ day, hours }) => (
                  <div key={day} className="contents">
                    <dt className="text-muted">{day}</dt>
                    <dd className={cn(hours === "Fechado" && "text-muted")}>{hours}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm">{place.rawHours}</p>
            )}
          </Info>
        )}
      </Card>

      {place.fromOpenStreetMap && <OsmAttribution />}
    </article>
  );
}

