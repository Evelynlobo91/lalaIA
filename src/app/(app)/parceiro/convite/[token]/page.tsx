import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcceptInviteForm, inviteByToken } from "@/modules/crm";
import { requireUser } from "@/modules/identity";
import { ButtonLink, Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Convite de parceiro", robots: { index: false } };
export const dynamic = "force-dynamic";

const messages = {
  expired: "Este convite venceu. Peça um novo link ao time do LalaIA.",
  revoked: "Este convite foi substituído por outro. Use o link mais recente.",
  accepted: "Este convite já foi usado.",
} as const;

export default async function ConvitePage({ params }: PageProps<"/parceiro/convite/[token]">) {
  const { token } = await params;
  // Sem sessão: entra (ou cria a conta) e volta para este mesmo link.
  const user = await requireUser(`/parceiro/convite/${token}`);
  const invite = await inviteByToken(token);
  if (!invite) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Convite de parceiro</h1>
        <p className="text-muted">O time do LalaIA convidou {invite.businessName} para o portal do parceiro.</p>
      </header>

      {invite.status === "valid" ? (
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>{invite.businessName}</CardTitle>
            <CardDescription>
              Ao aceitar, a conta <strong>{user.email}</strong> vira a responsável por este negócio no LalaIA, já aprovada: você pode publicar eventos, missões e ofertas sem preencher o cadastro de novo.
            </CardDescription>
          </div>
          <AcceptInviteForm token={token} businessName={invite.businessName} />
        </Card>
      ) : (
        <>
          <FormAlert>{messages[invite.status]}</FormAlert>
          <ButtonLink href="/parceiro" variant="secondary" className="self-start">
            Ir para o portal do parceiro
          </ButtonLink>
        </>
      )}
    </div>
  );
}
