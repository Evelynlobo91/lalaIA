import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentHref } from "@/modules/backoffice";
import { hasRole, requireRole } from "@/modules/identity";
import { EditPlaceForm, editablePlace } from "@/modules/places";

export const metadata: Metadata = { title: "Editar lugar · Backoffice", robots: { index: false } };

export default async function AdminEditarLugarPage({ params }: PageProps<"/admin/conteudo/lugares/[id]/editar">) {
  const admin = await requireRole("admin", "/admin/conteudo");
  const { id } = await params;
  const data = await editablePlace({ id: admin.id, isAdmin: hasRole(admin, "admin") }, id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href={contentHref("lugares")} className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <h1 className="text-2xl font-bold">Editar {data.place.name}</h1>
      <p className="text-sm text-muted">
        Ao salvar, esta versão passa a valer e não é mais sobrescrita pelos dados do OpenStreetMap.{" "}
        <Link href={`/lugares/${data.place.id}`} className="text-brand underline">
          Ver página pública
        </Link>
      </p>
      <EditPlaceForm place={data.place} schedule={data.schedule} simplified={data.simplified} />
    </div>
  );
}
