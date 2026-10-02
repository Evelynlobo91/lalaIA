import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CTA_LIMITS, CTA_PRIORITY_LABELS, CTA_TYPE_LABELS, CtaForm, DeleteCtaButton, StreamStatusBadge, TriggerCtaButton, describeSchedule, liveCtaPanel, livePortal } from "@/modules/live";
import { requirePartner } from "@/modules/partners";
import { formatTime } from "@/shared/time/joinville-time";
import { Badge, ButtonLink, Card, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Chamadas na live · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function ChamadasLivePage({ params, searchParams }: PageProps<"/parceiro/live/chamadas/[streamId]">) {
  const { streamId } = await params;
  const { salvo } = await searchParams;
  const { user } = await requirePartner(`/parceiro/live/chamadas/${streamId}`);
  const [panel, portal] = await Promise.all([liveCtaPanel(user, streamId), livePortal(user)]);
  if (!panel) notFound();
  const label = portal.targets.find((t) => t.stream?.id === streamId)?.label ?? "Transmissão";
  const { ctas, agenda } = panel;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/parceiro/live" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Live
      </Link>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Chamadas na live</h1>
          <StreamStatusBadge status={panel.stream.status} />
        </div>
        <p className="text-muted">
          {label}. Uma chamada é um cartão que aparece sobre a sua live, na hora que você definir, para levar quem assiste a agir: resgatar uma oferta, aceitar uma missão, ir até o lugar. Só aparece com a live ao vivo, uma por vez.
        </p>
      </div>
      {salvo && <FormAlert variant="success">Chamada salva.</FormAlert>}

      <section className="flex flex-col gap-3" aria-labelledby="agenda">
        <h2 id="agenda" className="text-xl font-semibold">
          Agenda de hoje
        </h2>
        {agenda.timed.length === 0 && agenda.whenLive.length === 0 ? (
          <p className="text-muted">Nada programado para hoje.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" aria-label="Agenda de hoje">
            {agenda.timed.map((entry) => (
              <li key={`${entry.ctaId}-${entry.start.getTime()}`} className="rounded-xl border border-border px-3 py-2">
                <span className="font-mono">
                  {formatTime(entry.start)}–{formatTime(entry.end)}
                </span>{" "}
                · {entry.title}
              </li>
            ))}
            {agenda.whenLive.map((cta) => (
              <li key={cta.id} className="rounded-xl border border-border px-3 py-2">
                <span className="text-muted">Quando a live entrar no ar:</span> {cta.title} <span className="text-muted">({describeSchedule(cta.schedule).toLowerCase()})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="chamadas">
        <h2 id="chamadas" className="text-xl font-semibold">
          Chamadas ({ctas.length} de {CTA_LIMITS.perStream})
        </h2>
        {ctas.length === 0 ? (
          <p className="text-muted">Nenhuma chamada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Chamadas da transmissão">
            {ctas.map((cta) => (
              <li key={cta.id}>
                <Card className="flex flex-wrap items-center gap-3" aria-label={`Chamada ${cta.title}`}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-medium">{cta.title}</p>
                    <p className="text-sm text-muted">{describeSchedule(cta.schedule)}</p>
                    <p className="text-sm text-muted">
                      Botão “{cta.buttonLabel}” · prioridade {CTA_PRIORITY_LABELS[cta.priority].toLowerCase()}
                    </p>
                  </div>
                  <Badge variant="neutral">{CTA_TYPE_LABELS[cta.type]}</Badge>
                  <div className="flex w-full items-center gap-3 sm:w-auto">
                    <Link href={`/parceiro/live/chamadas/${streamId}/${cta.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline" aria-label={`Editar a chamada ${cta.title}`}>
                      Editar
                    </Link>
                    <DeleteCtaButton ctaId={cta.id} title={cta.title} />
                  </div>
                  {panel.entitled && panel.stream.status !== "ended" && (
                    <TriggerCtaButton ctaId={cta.id} title={cta.title} live={panel.stream.status === "live"} runningUntil={cta.triggeredUntil && cta.triggeredUntil > now ? cta.triggeredUntil.toISOString() : null} />
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="nova">
        <h2 id="nova" className="text-xl font-semibold">
          Nova chamada
        </h2>
        {panel.stream.status === "ended" ? (
          <p className="text-muted">Esta transmissão foi encerrada: não dá para programar chamadas nela.</p>
        ) : !panel.entitled ? (
          <Card className="flex flex-col gap-3" role="status">
            <p className="font-medium">O seu plano atual não inclui chamadas na live.</p>
            <p className="text-sm text-muted">Mude para um plano que libere as chamadas para converter quem assiste em quem vai até o local.</p>
            <ButtonLink href="/parceiro/assinatura" className="self-start">
              Ver planos
            </ButtonLink>
          </Card>
        ) : ctas.length >= CTA_LIMITS.perStream ? (
          <p className="text-muted">Limite de chamadas atingido. Remova alguma para criar outra.</p>
        ) : (
          <Card>
            <CtaForm streamId={streamId} options={panel.options} submitLabel="Programar chamada" />
          </Card>
        )}
      </section>
    </div>
  );
}
