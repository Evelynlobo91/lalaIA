import { Ban, Clock, TicketCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasRole, requireUser } from "@/modules/identity";
import { ApplyForm, myPartnerApplication, myTeamMemberships } from "@/modules/partners";
import { ButtonLink, Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Portal do parceiro" };

export default async function ParceiroPage() {
  const user = await requireUser("/parceiro");

  const [application, memberships] = await Promise.all([myPartnerApplication(user), myTeamMemberships(user)]);
  if (hasRole(user, "partner") && application?.status === "approved") redirect("/parceiro/inicio");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Seja parceiro do LalaIA</h1>
        <p className="text-muted">Estabelecimentos e promotores de Joinville divulgam eventos, lives, missões e recompensas para quem está procurando o que fazer agora.</p>
      </header>

      {memberships.length > 0 && (
        <Card className="flex items-start gap-3">
          <TicketCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
          <div className="flex flex-col gap-3">
            <div>
              <CardTitle>Você faz parte de uma equipe</CardTitle>
              <CardDescription>Atende no balcão de {memberships.map((m) => m.businessName).join(", ")}.</CardDescription>
            </div>
            <ButtonLink href="/parceiro/balcao" className="self-start">
              Abrir o balcão
            </ButtonLink>
          </div>
        </Card>
      )}

      {application?.status === "pending" && (
        <Card className="flex items-start gap-3" role="status">
          <Clock aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
          <div>
            <CardTitle>Cadastro em análise</CardTitle>
            <CardDescription>
              Recebemos o cadastro de <strong>{application.businessName}</strong>. Nossa equipe analisa em até 2 dias úteis e você verá a resposta aqui.
            </CardDescription>
          </div>
        </Card>
      )}

      {application?.status === "rejected" && (
        <FormAlert>
          <span className="flex items-start gap-2">
            <XCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Seu cadastro não foi aprovado.</strong> Motivo: {application.rejectionReason} Corrija abaixo e envie de novo.
            </span>
          </span>
        </FormAlert>
      )}

      {application?.status === "suspended" && (
        <FormAlert>
          <span className="flex items-start gap-2">
            <Ban aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Seu acesso ao portal está suspenso.</strong> Motivo: {application.suspensionReason} Enquanto isso, o que você publicou não aparece no app. Fale com o suporte para regularizar.
            </span>
          </span>
        </FormAlert>
      )}

      {application?.status === "approved" && (
        <Card role="status">
          <CardTitle>Cadastro aprovado</CardTitle>
          <CardDescription>Estamos liberando seu acesso ao portal. Se esta mensagem não sumir em alguns minutos, fale com o suporte.</CardDescription>
        </Card>
      )}

      {application?.status !== "approved" && application?.status !== "suspended" && (
        <Card className="flex flex-col gap-4">
          <CardTitle>{application ? "Editar cadastro" : "Cadastro de parceiro"}</CardTitle>
          <ApplyForm current={application} submitLabel={application?.status === "rejected" ? "Enviar de novo" : application ? "Salvar alterações" : "Enviar para análise"} />
        </Card>
      )}
    </div>
  );
}
