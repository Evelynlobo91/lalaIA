import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventDetailCard, getEventDetail } from "@/modules/events";

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
  const event = await getEventDetail(id);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/eventos" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> O que fazer
      </Link>
      <EventDetailCard event={event} />
    </div>
  );
}
