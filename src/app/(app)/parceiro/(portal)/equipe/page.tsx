import type { Metadata } from "next";
import { InviteMemberForm, MAX_TEAM_MEMBERS, RemoveMemberButton, myTeam, requirePartner } from "@/modules/partners";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Equipe · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function EquipePortalPage() {
  const session = await requirePartner("/parceiro/equipe");
  const team = await myTeam(session);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Equipe</h1>
        <p className="text-muted">
          Convide funcionários para atender no balcão. Quem é da equipe só valida os códigos das suas ofertas: não vê a assinatura nem os dados e não altera o que você publica. Até {MAX_TEAM_MEMBERS} pessoas.
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <InviteMemberForm />
        <p className="text-sm text-muted">A pessoa entra no LalaIA com este e-mail e abre “Portal do parceiro”. Se ainda não tem conta, o acesso passa a valer assim que ela se cadastrar e confirmar o e-mail.</p>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="membros">
        <h2 id="membros" className="text-xl font-semibold">
          Membros ({team.length})
        </h2>
        {team.length === 0 ? (
          <p className="text-muted">Ninguém na equipe ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Membros da equipe">
            {team.map((member) => (
              <li key={member.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium break-all">{member.email}</p>
                    <p className="text-sm text-muted">Convidado em {formatDateTime(member.invitedAt)}</p>
                  </div>
                  <Badge variant={member.joined ? "success" : "neutral"}>{member.joined ? "Com acesso" : "Aguardando cadastro"}</Badge>
                  <RemoveMemberButton memberId={member.id} email={member.email} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
