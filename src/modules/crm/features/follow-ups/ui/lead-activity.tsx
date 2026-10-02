import Link from "next/link";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";
import { formatDay } from "../../../domain/follow-up";
import type { LeadActivityView, MyFollowUp } from "../follow-ups.use-cases";
import { CompleteFollowUpButton, NextStepForm, NoteForm } from "./lead-activity-forms";

/** Próximo passo e anotações na página do lead (#149). */
export function LeadActivityPanel({ leadId, activity, today }: { leadId: string; activity: LeadActivityView; today: string }) {
  const { nextStep, notes } = activity;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="proximo-passo">
        <h2 id="proximo-passo" className="text-xl font-semibold">
          Próximo passo
        </h2>
        {nextStep ? (
          <Card className="flex flex-col gap-2" aria-label="Próximo passo em aberto">
            <p className="font-medium">{nextStep.description}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              Até {formatDay(nextStep.dueOn)}
              {nextStep.overdue && <Badge variant="danger">Atrasado</Badge>}
            </p>
            <CompleteFollowUpButton followUpId={nextStep.id} label={`Concluir: ${nextStep.description}`} />
          </Card>
        ) : (
          <p className="text-sm text-muted">Nenhum próximo passo combinado.</p>
        )}
        <NextStepForm key={nextStep?.id ?? "novo"} leadId={leadId} current={nextStep} minDate={today} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="anotacoes">
        <h2 id="anotacoes" className="text-xl font-semibold">
          Anotações ({notes.length})
        </h2>
        <NoteForm key={notes.length} leadId={leadId} />
        {notes.length > 0 && (
          <ol className="flex flex-col gap-3" aria-label="Anotações">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                <p className="whitespace-pre-line">{note.body}</p>
                <p className="text-muted">
                  {note.authorName} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** "Meus follow-ups de hoje": os de hoje e os atrasados, com atalho para concluir. */
export function MyFollowUpsList({ items, canWrite }: { items: MyFollowUp[]; canWrite: boolean }) {
  if (items.length === 0) return <p className="text-muted">Nada para hoje. Nenhum follow-up atrasado.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Follow-ups de hoje e atrasados">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="flex flex-col gap-2" aria-label={`${item.businessName}: ${item.description}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{item.description}</p>
                <p className="text-sm text-muted">
                  <Link href={`/admin/leads/${item.leadId}`} prefetch={false} className="underline">
                    {item.businessName}
                  </Link>{" "}
                  · {item.contactName}
                  {item.contactPhone ? ` · ${item.contactPhone}` : ""}
                </p>
              </div>
              {item.overdue ? <Badge variant="danger">Atrasado desde {formatDay(item.dueOn)}</Badge> : <Badge variant="brand">Hoje</Badge>}
            </div>
            {canWrite && <CompleteFollowUpButton followUpId={item.id} label={`Concluir: ${item.description}`} />}
          </Card>
        </li>
      ))}
    </ul>
  );
}
