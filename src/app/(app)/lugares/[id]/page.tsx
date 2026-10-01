import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteToggle } from "@/modules/favorites";
import { PlaceDetailCard, getPlaceDetail } from "@/modules/places";

// "Aberto agora" depende da hora da visita.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/lugares/[id]">): Promise<Metadata> {
  const { id } = await params;
  const place = await getPlaceDetail(id);
  if (!place) return { title: "Lugar não encontrado" };

  const description = [place.categoryLabel, place.address ?? (place.neighborhood ? `${place.neighborhood}, Joinville` : "Joinville")].join(" · ");
  return {
    title: place.name,
    description,
    alternates: { canonical: `/lugares/${place.id}` },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "LalaIA",
      title: `${place.name} · LalaIA`,
      description,
      url: `/lugares/${place.id}`,
    },
    twitter: { card: "summary_large_image", title: place.name, description },
  };
}

export default async function LugarPage({ params }: PageProps<"/lugares/[id]">) {
  const { id } = await params;
  const place = await getPlaceDetail(id);
  if (!place) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/lugares" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Onde ir
      </Link>
      <PlaceDetailCard place={place} extras={<FavoriteToggle entityType="place" entityId={place.id} className="sm:self-start" />} />
    </div>
  );
}
