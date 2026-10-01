import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm, editableEvent } from "@/modules/events";
import { hasRole } from "@/modules/identity";
import { requirePartner } from "@/modules/partners";
import { PlacePicker } from "@/modules/places";

export const metadata: Metadata = { title: "Editar evento · Portal do parceiro" };

export default async function EditarEventoPage({ params }: PageProps<"/parceiro/eventos/[id]/editar">) {
  const { user } = await requirePartner("/parceiro/eventos");
  const { id } = await params;
  const data = await editableEvent({ id: user.id, isAdmin: hasRole(user, "admin") }, id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/eventos" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Eventos
      </Link>
      <h1 className="text-2xl font-bold">Editar evento</h1>
      <EventForm initial={data.values} submitLabel="Salvar alterações" placeField={<PlacePicker name="placeId" label="Onde vai ser" initial={data.place} />} />
    </div>
  );
}
