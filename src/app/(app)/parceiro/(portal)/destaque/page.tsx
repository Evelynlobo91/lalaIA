import type { Metadata } from "next";
import { EndSponsorshipButton, MAX_ACTIVE_SPONSORSHIPS, StartSponsorshipForm, mySponsorships, offerTargetChoices, requirePartner } from "@/modules/partners";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, ButtonLink, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Destaque · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function DestaquePortalPage() {
  const session = await requirePartner("/parceiro/destaque");
  const [{ items, entitled }, targets] = await Promise.all([mySponsorships(session), offerTargetChoices(session)]);
  const running = items.filter((item) => item.running);
  const past = items.filter((item) => !item.running);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Destaque</h1>
        <p className="text-muted">
          Um lugar ou evento em destaque ganha prioridade nas sugestões do LalaIA e aparece sinalizado como “Patrocinado”. Você pode ter até {MAX_ACTIVE_SPONSORSHIPS} destaques ao mesmo tempo.
        </p>
      </div>

      {!entitled ? (
        <Card className="flex flex-col gap-3" role="status">
          <p className="font-medium">O seu plano atual não inclui destaque.</p>
          <p className="text-sm text-muted">Mude para um plano que libere o destaque para aparecer primeiro nas sugestões.</p>
          <ButtonLink href="/parceiro/assinatura" className="self-start">
            Ver planos
          </ButtonLink>
        </Card>
      ) : targets.length === 0 ? (
        <p className="text-muted">Você ainda não tem um lugar ou evento para destacar. Assuma o seu lugar em “Meus lugares” ou publique um evento.</p>
      ) : (
        <StartSponsorshipForm targets={targets.map((t) => ({ value: t.value, label: `${t.type === "place" ? "Lugar" : "Evento"}: ${t.label}` }))} />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="no-ar">
        <h2 id="no-ar" className="text-xl font-semibold">
          No ar ({running.length})
        </h2>
        {running.length === 0 ? (
          <p className="text-muted">Nenhum destaque no ar.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Destaques no ar">
            {running.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center gap-3" aria-label={`Destaque de ${item.targetName}`}>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">{item.targetName}</p>
                    <p className="text-sm text-muted">
                      {item.target.type === "place" ? "Lugar" : "Evento"} · até {formatDateTime(item.endsAt)}
                    </p>
                  </div>
                  <Badge variant="success">No ar</Badge>
                  <EndSponsorshipButton sponsorshipId={item.id} targetName={item.targetName} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="anteriores">
          <h2 id="anteriores" className="text-xl font-semibold">
            Anteriores
          </h2>
          <ul className="flex flex-col gap-2 text-sm" aria-label="Destaques anteriores">
            {past.map((item) => (
              <li key={item.id} className="rounded-xl border border-border px-3 py-2">
                {item.targetName} <span className="text-muted">· {formatDateTime(item.startsAt)} a {formatDateTime(item.endsAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
