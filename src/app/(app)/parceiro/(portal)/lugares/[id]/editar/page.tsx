import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole } from "@/modules/identity";
import { requirePartner } from "@/modules/partners";
import { EditPlaceForm, editablePlace } from "@/modules/places";

export const metadata: Metadata = { title: "Editar lugar · Portal do parceiro" };

export default async function EditarLugarPage({ params }: PageProps<"/parceiro/lugares/[id]/editar">) {
  const { user } = await requirePartner("/parceiro/lugares");
  const { id } = await params;
  // Só o responsável pelo lugar (ou admin) recebe os dados; para os demais, o lugar "não existe" aqui.
  const data = await editablePlace({ id: user.id, isAdmin: hasRole(user, "admin") }, id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/lugares" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Meus lugares
      </Link>
      <h1 className="text-2xl font-bold">Editar {data.place.name}</h1>
      <p className="text-sm text-muted">
        Ao salvar, sua versão passa a valer e não é mais sobrescrita pelos dados do OpenStreetMap.{" "}
        <Link href={`/lugares/${data.place.id}`} className="text-brand underline">
          Ver página pública
        </Link>
      </p>
      <EditPlaceForm place={data.place} schedule={data.schedule} simplified={data.simplified} />
    </div>
  );
}
