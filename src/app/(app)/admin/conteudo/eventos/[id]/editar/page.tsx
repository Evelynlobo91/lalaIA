import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTENT_RETURN, contentHref } from "@/modules/backoffice";
import { EventForm, editableEvent } from "@/modules/events";
import { hasRole, requireRole } from "@/modules/identity";
import { PlacePicker } from "@/modules/places";

export const metadata: Metadata = { title: "Editar evento · Backoffice", robots: { index: false } };

export default async function AdminEditarEventoPage({ params }: PageProps<"/admin/conteudo/eventos/[id]/editar">) {
  const admin = await requireRole("admin", "/admin/conteudo");
  const { id } = await params;
  const data = await editableEvent({ id: admin.id, isAdmin: hasRole(admin, "admin") }, id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href={contentHref("eventos")} className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <h1 className="text-2xl font-bold">Editar evento</h1>
      <EventForm
        initial={data.values}
        submitLabel="Salvar alterações"
        returnTo={CONTENT_RETURN}
        placeField={<PlacePicker name="placeId" label="Onde vai ser" initial={data.place} />}
      />
    </div>
  );
}
