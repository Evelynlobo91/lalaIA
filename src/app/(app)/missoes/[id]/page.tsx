import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity";
import { AcceptMissionButton, MissionProgressPanel, MissionRewardCard, SurpriseOfferButtons, missionProgress, missionReward } from "@/modules/missions";
import { formatTime } from "@/shared/time/joinville-time";
import { ButtonLink, Card, FormAlert } from "@/shared/ui";

// Progresso pessoal e janela de validade: sempre na hora.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/missoes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const view = await missionProgress(user?.id ?? null, id);
  return { title: view ? `${view.mission.title} · Missões` : "Missão" };
}

export default async function MissaoPage({ params, searchParams }: PageProps<"/missoes/[id]">) {
  const { id } = await params;
  const { aceita, etapa } = await searchParams;
  const user = await getCurrentUser();
  const view = await missionProgress(user?.id ?? null, id);
  if (!view) notFound();
  // Recompensa do parceiro (#62): só depois de saber que a pessoa pode ver a missão.
  const reward = await missionReward(user?.id ?? null, view.mission.id);
  // ?etapa=<id> depois de validar o QR: só vale se a etapa estiver mesmo concluída.
  const completedStep = typeof etapa === "string" ? view.steps.find((s) => s.id === etapa && s.state === "done") : undefined;

  const action = !view.mission.available ? null : view.surpriseOffer ? (
    <Card className="flex flex-col gap-3">
      <p>
        Missão surpresa! As etapas são reveladas uma por vez depois do aceite. Aceite até <strong>{formatTime(view.surpriseOffer.expiresAt)}</strong>.
      </p>
      <SurpriseOfferButtons missionId={view.mission.id} title={view.mission.title} />
    </Card>
  ) : user ? (
    <Card className="flex flex-col gap-3">
      <p>Aceite a missão para começar. Depois é só ir aos lugares e validar cada etapa: QR code no balcão ou check-in por GPS.</p>
      <AcceptMissionButton missionId={view.mission.id} title={view.mission.title} />
    </Card>
  ) : (
    <ButtonLink href={`/entrar?next=${encodeURIComponent(`/missoes/${view.mission.id}`)}`} className="self-start">
      Entre para aceitar
    </ButtonLink>
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href="/missoes" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Missões
      </Link>
      {aceita && view.userMission && <FormAlert variant="success">Missão aceita! Boa exploração.</FormAlert>}
      {completedStep && (
        <FormAlert variant="success">
          Etapa {completedStep.position} concluída! +{view.xp.perStep} XP.
          {view.userMission?.status === "completed" && ` Missão concluída! +${view.xp.completionBonus} XP de bônus.`}
        </FormAlert>
      )}
      <MissionProgressPanel view={view} action={action} />
      {reward && <MissionRewardCard reward={reward} />}
    </div>
  );
}
