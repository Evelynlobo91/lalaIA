import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole } from "@/modules/identity";
import { MissionForm, editableMission, missionPlaceOptions } from "@/modules/missions";
import { requirePartner } from "@/modules/partners";

export const metadata: Metadata = { title: "Editar missão · Portal do parceiro" };

export default async function EditarMissaoPage({ params }: PageProps<"/parceiro/missoes/[id]/editar">) {
  const { user } = await requirePartner("/parceiro/missoes");
  const { id } = await params;
  const data = await editableMission({ id: user.id, isAdmin: hasRole(user, "admin") }, id);
  if (!data) notFound();
  const placeOptions = await missionPlaceOptions(user.id);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/missoes" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Missões
      </Link>
      <h1 className="text-2xl font-bold">Editar missão</h1>
      <MissionForm initial={data.values} placeOptions={placeOptions} stepsLocked={data.stepsLocked} submitLabel="Salvar alterações" />
    </div>
  );
}
