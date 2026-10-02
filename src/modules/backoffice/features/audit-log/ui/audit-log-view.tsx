import Form from "next/form";
import Link from "next/link";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Button, Card } from "@/shared/ui";
import { auditActions } from "../audit-events";
import { AUDIT_PAGE_SIZE, auditPeriods, type AuditRow, type AuditView } from "../audit-log.use-cases";

const targetLabels: Record<AuditRow["targetType"], string> = { partner: "Parceiro", place_claim: "Vínculo", place: "Lugar", event: "Evento", mission: "Missão" };

/** Para onde o alvo leva, quando há uma tela para ele. */
function targetHref(row: AuditRow): string | null {
  if (row.targetType === "place") return `/lugares/${row.targetId}`;
  if (row.targetType === "event") return `/eventos/${row.targetId}`;
  if (row.targetType === "mission") return `/missoes/${row.targetId}`;
  return null;
}

const selectClass = "h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal";

/** Trilha de auditoria (#146): filtros por período, ação e pessoa (GET, sem JavaScript) e a tabela dos registros. */
export function AuditLogView({ view }: { view: AuditView }) {
  const { filter, rows, actors, truncated } = view;

  return (
    <div className="flex flex-col gap-4">
      <Form action="/admin/auditoria" className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Período
          <select name="periodo" defaultValue={String(filter.periodo)} className={selectClass}>
            {auditPeriods.map((days) => (
              <option key={days} value={days}>
                Últimos {days} dias
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Ação
          <select name="acao" defaultValue={filter.acao ?? ""} className={selectClass}>
            <option value="">Todas as ações</option>
            {auditActions.map(({ action, label }) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Quem
          <select name="quem" defaultValue={filter.quem ?? ""} className={selectClass}>
            <option value="">Todo mundo</option>
            {actors.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </Form>

      {rows.length === 0 ? (
        <p className="text-muted">Nenhuma ação administrativa neste período com estes filtros.</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Ações administrativas, da mais recente para a mais antiga</caption>
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Quando
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Quem
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Ação
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Em quê
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const href = targetHref(row);
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.occurredAt)}</td>
                    <td className="px-4 py-3">{row.actorName}</td>
                    <td className="px-4 py-3">{row.actionLabel}</td>
                    <td className="px-4 py-3">
                      {href ? (
                        <Link href={href} prefetch={false} className="text-brand underline">
                          {targetLabels[row.targetType]}
                        </Link>
                      ) : (
                        targetLabels[row.targetType]
                      )}{" "}
                      <span className="text-muted">{row.targetId.slice(0, 8)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {truncated && <p className="text-sm text-muted">Mostrando as {AUDIT_PAGE_SIZE} ações mais recentes. Use os filtros para ver as demais.</p>}
    </div>
  );
}
