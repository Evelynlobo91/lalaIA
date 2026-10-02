import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTENT_RETURN, contentHref } from "@/modules/backoffice";
import { hasRole, requireRole } from "@/modules/identity";
import { MissionForm, editableMission, missionPlaceOptions } from "@/modules/missions";

export const metadata: Metadata = { title: "Editar missão · Backoffice", robots: { index: false } };

export default async function AdminEditarMissaoPage({ params }: PageProps<"/admin/conteudo/missoes/[id]/editar">) {
  const admin = await requireRole("admin", "/admin/conteudo");
  const { id } = await params;
  const data = await editableMission({ id: admin.id, isAdmin: hasRole(admin, "admin") }, id);
  if (!data) notFound();
  // As opções de lugar são as de quem criou a missão (o admin não administra lugares).
  const placeOptions = await missionPlaceOptions(data.mission.ownerId);

  return (
    <div className="flex flex-col gap-4">
      <Link href={contentHref("missoes")} className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <h1 className="text-2xl font-bold">Editar missão</h1>
      <MissionForm initial={data.values} placeOptions={placeOptions} stepsLocked={data.stepsLocked} submitLabel="Salvar alterações" returnTo={CONTENT_RETURN} />
    </div>
  );
}
