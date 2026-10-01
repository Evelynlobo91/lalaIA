import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TrackView } from "@/modules/analytics";
import { LiveNowProvider, LivePlayerFor, liveNowKeys } from "@/modules/live";
import { EventDetailCard, getEventDetail } from "@/modules/events";
import { FavoriteToggle, WantToGoButton } from "@/modules/favorites";

// A fase do evento (acontecendo/encerrado) depende da hora da visita.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/eventos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) return { title: "Evento não encontrado" };
  const description = [event.whenLabel, event.place?.name, event.priceLabel].filter(Boolean).join(" · ");
  return {
    title: event.title,
    description,
    alternates: { canonical: `/eventos/${event.id}` },
    openGraph: { type: "website", locale: "pt_BR", siteName: "LalaIA", title: `${event.title} · LalaIA`, description, url: `/eventos/${event.id}` },
    twitter: { card: "summary_large_image", title: event.title, description },
    robots: event.phase === "cancelled" ? { index: false } : undefined,
  };
}

export default async function EventoPage({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  const [event, live] = await Promise.all([getEventDetail(id), liveNowKeys()]);
  if (!event) notFound();

  return (
    // Selo "Ao vivo" no cabeçalho (EventDetailCard só lê o LiveNowContext; não conhece o módulo live).
    <LiveNowProvider initial={live}>
      <div className="flex flex-col gap-4">
        <Link href="/eventos" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> O que fazer
        </Link>
        <EventDetailCard
          event={event}
          extras={
            <>
              <Suspense fallback={null}>
                <LivePlayerFor entityType="event" entityId={event.id} title={event.title} />
              </Suspense>
              <FavoriteToggle entityType="event" entityId={event.id} className="sm:self-start" />
            </>
          }
          directions={event.place && <WantToGoButton href={event.place.directionsUrl} entityType="event" entityId={event.id} className="sm:w-auto sm:self-start" />}
        />
        <TrackView entityType="event" entityId={event.id} />
      </div>
    </LiveNowProvider>
  );
}
