import { QrCode, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { requireUser } from "@/modules/identity";
import { ConfirmStepForm, inspectStepQr } from "@/modules/missions";
import { Badge, ButtonLink, Card, EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Validar etapa · Missões", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Destino do QR do balcão. Só mostra e confere (GET não grava); concluir é o POST do botão. */
export default async function ValidarEtapaPage({ searchParams }: PageProps<"/missoes/validar">) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const user = await requireUser(`/missoes/validar?t=${encodeURIComponent(token)}`);
  const check = await inspectStepQr(user.id, token);

  if (!check.ok) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Validar etapa</h1>
        <EmptyState
          icon={TriangleAlert}
          title="Não deu para validar"
          description={check.message}
          action={
            check.missionId ? (
              <ButtonLink href={`/missoes/${check.missionId}`} variant="secondary">
                Ver a missão
              </ButtonLink>
            ) : (
              <ButtonLink href="/missoes" variant="secondary">
                Ver missões
              </ButtonLink>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Validar etapa</h1>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">+{check.stepXp} XP</Badge>
          <span className="text-sm text-muted">
            Etapa {check.step.position} de {check.mission.totalSteps}
          </span>
        </div>
        <p className="text-sm text-muted">{check.mission.title}</p>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <QrCode aria-hidden className="size-6 text-brand" /> {check.step.title}
        </h2>
        {check.step.placeName && <p>{check.step.placeName}</p>}
        <ConfirmStepForm token={check.token} />
      </Card>
    </div>
  );
}
