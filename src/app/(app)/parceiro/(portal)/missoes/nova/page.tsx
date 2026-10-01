import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MissionForm, missionPlaceOptions } from "@/modules/missions";
import { requirePartner } from "@/modules/partners";
import { ButtonLink, EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Nova missão · Portal do parceiro" };

export default async function NovaMissaoPage() {
  const { user } = await requirePartner("/parceiro/missoes/nova");
  const placeOptions = await missionPlaceOptions(user.id);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/parceiro/missoes" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Missões
      </Link>
      <h1 className="text-2xl font-bold">Nova missão</h1>
      {placeOptions.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Você ainda não administra nenhum lugar"
          description="As etapas de uma missão acontecem nos seus lugares. Reivindique o seu estabelecimento primeiro."
          action={<ButtonLink href="/parceiro/lugares">Meus lugares</ButtonLink>}
        />
      ) : (
        <MissionForm submitLabel="Publicar missão" placeOptions={placeOptions} />
      )}
    </div>
  );
}
