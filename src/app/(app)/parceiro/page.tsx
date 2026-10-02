import { Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasRole, requireUser } from "@/modules/identity";
import { ApplyForm, myPartnerApplication } from "@/modules/partners";
import { Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Portal do parceiro" };

export default async function ParceiroPage() {
  const user = await requireUser("/parceiro");

  const application = await myPartnerApplication(user);
  if (hasRole(user, "partner") && application?.status === "approved") redirect("/parceiro/inicio");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Seja parceiro do LalaIA</h1>
        <p className="text-muted">Estabelecimentos e promotores de Joinville divulgam eventos, lives, missões e recompensas para quem está procurando o que fazer agora.</p>
      </header>

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

      {application?.status === "approved" && (
        <Card role="status">
          <CardTitle>Cadastro aprovado</CardTitle>
          <CardDescription>Estamos liberando seu acesso ao portal. Se esta mensagem não sumir em alguns minutos, fale com o suporte.</CardDescription>
        </Card>
      )}

      {application?.status !== "approved" && (
        <Card className="flex flex-col gap-4">
          <CardTitle>{application ? "Editar cadastro" : "Cadastro de parceiro"}</CardTitle>
          <ApplyForm current={application} submitLabel={application?.status === "rejected" ? "Enviar de novo" : application ? "Salvar alterações" : "Enviar para análise"} />
        </Card>
      )}
    </div>
  );
}
