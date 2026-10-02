import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventForm } from "@/modules/events";
import { requirePartner } from "@/modules/partners";
import { PlacePicker } from "@/modules/places";

export const metadata: Metadata = { title: "Novo evento · Portal do parceiro" };

export default async function NovoEventoPage() {
  await requirePartner("/parceiro/eventos/novo");
  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/eventos" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Eventos
      </Link>
      <h1 className="text-2xl font-bold">Novo evento</h1>
      <EventForm submitLabel="Publicar evento" placeField={<PlacePicker name="placeId" label="Onde vai ser" />} />
    </div>
  );
}
