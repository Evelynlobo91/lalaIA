import { Plus, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveMissionButton, missionsByOwner, xpBreakdown, type MissionRecord } from "@/modules/missions";
import { requirePartner } from "@/modules/partners";
import { Badge, ButtonLink, Card, EmptyState, FormAlert } from "@/shared/ui";
import { formatDateTime } from "@/shared/time/joinville-time";

export const metadata: Metadata = { title: "Missões · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function MissoesPortalPage({ searchParams }: PageProps<"/parceiro/missoes">) {
  const { user } = await requirePartner("/parceiro/missoes");
  const { salvo } = await searchParams;
  const all = await missionsByOwner(user.id);
  const now = new Date();

  const current = all.filter((m) => m.status === "active" && m.endsAt > now);
  const finished = all.filter((m) => m.status === "archived" || m.endsAt <= now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Missões</h1>
        <ButtonLink href="/parceiro/missoes/nova">
          <Plus aria-hidden className="size-5" /> Nova missão
        </ButtonLink>
      </div>
      {salvo && <FormAlert variant="success">Missão salva.</FormAlert>}

      {all.length === 0 ? (
        <EmptyState icon={Target} title="Nenhuma missão ainda" description="Crie missões com etapas nos seus lugares para trazer exploradores até você." />
      ) : (
        <>
          <MissionGroup title="Em andamento e agendadas" items={current} now={now} editable />
          <MissionGroup title="Encerradas" items={finished} now={now} />
        </>
      )}
    </div>
  );
}

function MissionGroup({ title, items, now, editable = false }: { title: string; items: MissionRecord[]; now: Date; editable?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((m) => (
          <li key={m.id}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold">{m.title}</h3>
                {m.status === "archived" ? <Badge variant="danger">Encerrada</Badge> : m.startsAt > now ? <Badge>Agendada</Badge> : <Badge variant="brand">{m.xp} XP</Badge>}
              </div>
              <p className="text-sm text-muted">
                {m.steps.length} {m.steps.length === 1 ? "etapa" : "etapas"} · {xpBreakdown(m)}
              </p>
              <p className="text-sm text-muted">
                De {formatDateTime(m.startsAt)} até {formatDateTime(m.endsAt)}
              </p>
              {editable && (
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/parceiro/missoes/${m.id}/qr`} className="text-sm font-medium text-brand underline" aria-label={`QR codes de ${m.title}`}>
                    QR codes
                  </Link>
                  <Link href={`/parceiro/missoes/${m.id}/editar`} className="text-sm font-medium text-brand underline" aria-label={`Editar ${m.title}`}>
                    Editar
                  </Link>
                  <ArchiveMissionButton missionId={m.id} title={m.title} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
