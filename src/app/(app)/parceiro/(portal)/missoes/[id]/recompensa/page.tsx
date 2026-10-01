import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole } from "@/modules/identity";
import { REWARD_MESSAGES, RewardForm, ValidateRewardCodeForm, partnerRewardPanel } from "@/modules/missions";
import { requirePartner } from "@/modules/partners";
import { Card, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Recompensa · Portal do parceiro", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RecompensaMissaoPage({ params }: PageProps<"/parceiro/missoes/[id]/recompensa">) {
  const { user } = await requirePartner("/parceiro/missoes");
  const { id } = await params;
  const panel = await partnerRewardPanel({ id: user.id, isPartner: hasRole(user, "partner") }, id);
  if (!panel) notFound();
  const { mission, reward, locked, values } = panel;
  const editable = mission.status === "active" && panel.allowsRealReward && !locked;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/parceiro/missoes" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Missões
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Recompensa · {mission.title}</h1>
        <p className="text-muted">Quem concluir a missão ganha um código para trocar pela recompensa no seu balcão.</p>
      </header>

      {!panel.allowsRealReward && (
        <Card className="flex flex-col gap-2 border-warning" role="note" aria-label="Recompensa indisponível">
          <CardTitle as="h2">Esta missão não pode dar recompensa</CardTitle>
          <p className="text-sm">{REWARD_MESSAGES.requiresQr}</p>
          <p className="text-sm">
            {reward
              ? "A recompensa já vinculada fica suspensa: ninguém resgata até todas as etapas pedirem o QR code."
              : "Para oferecer um prêmio, edite as etapas e escolha QR code no balcão (ou QR code + GPS) em todas."}
          </p>
        </Card>
      )}

      {reward && (
        <Card className="flex flex-col gap-1" aria-label="Resgates">
          <CardTitle as="h2">{reward.description}</CardTitle>
          <p className="text-sm">
            {reward.claimedCount} {reward.claimedCount === 1 ? "resgate" : "resgates"}
            {reward.stock !== null && ` de ${reward.stock}`} · {panel.validatedCount} {panel.validatedCount === 1 ? "entregue" : "entregues"} no balcão
          </p>
          {locked && <p className="text-sm text-muted">{REWARD_MESSAGES.locked}</p>}
        </Card>
      )}

      {editable && (
        <Card className="flex flex-col gap-3">
          <CardTitle as="h2">{reward ? "Editar recompensa" : "Vincular recompensa"}</CardTitle>
          <RewardForm missionId={mission.id} initial={values} />
        </Card>
      )}
      {!reward && panel.allowsRealReward && mission.status !== "active" && <p className="text-muted">Missão encerrada não ganha recompensa nova.</p>}

      {reward && <ValidateRewardCodeForm missionId={mission.id} />}
    </div>
  );
}
