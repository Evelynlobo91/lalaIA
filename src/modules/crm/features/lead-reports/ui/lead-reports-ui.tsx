import Form from "next/form";
import Link from "next/link";
import { Button, Card, cn } from "@/shared/ui";
import { leadSources, leadStages, type LeadFilter } from "../../../domain/lead";
import { conversionPeriods, type ConversionView } from "../lead-reports";

const selectClass = "h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal";

/** Filtros por etapa, origem e responsável (#151): formulário GET, o filtro fica na URL e funciona sem JavaScript. */
export function LeadFilters({ action, filter, owners }: { action: string; filter: LeadFilter; owners: Array<{ id: string; name: string }> }) {
  const active = Boolean(filter.stage || filter.source || filter.ownerId);
  return (
    <Form action={action} className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end" aria-label="Filtros">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Etapa
        <select name="etapa" defaultValue={filter.stage ?? ""} className={selectClass}>
          <option value="">Todas as etapas</option>
          {leadStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Origem
        <select name="origem" defaultValue={filter.source ?? ""} className={selectClass}>
          <option value="">Todas as origens</option>
          {leadSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Responsável
        <select name="responsavel" defaultValue={filter.ownerId ?? ""} className={selectClass}>
          <option value="">Todo o time</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {active && (
          <Link href={action} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-muted underline hover:text-fg">
            Limpar
          </Link>
        )}
      </div>
    </Form>
  );
}

const int = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const chip = (active: boolean) =>
  cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:border-brand");

/** Taxa de conversão por origem (#151): tabela com leads, em aberto, perdidos, ativos e a taxa. */
export function ConversionTable({ view }: { view: ConversionView }) {
  const periods = [...conversionPeriods.map((days) => ({ value: days as number | "todos", label: `${days} dias` })), { value: "todos" as const, label: "Todo o período" }];
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Período">
        <ul className="flex flex-wrap gap-2">
          {periods.map(({ value, label }) => (
            <li key={value}>
              <Link href={value === "todos" ? "/admin/leads/conversao" : `/admin/leads/conversao?periodo=${value}`} aria-current={value === view.period ? "page" : undefined} className={chip(value === view.period)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Leads por origem e taxa de conversão em parceiro ativo</caption>
          <thead className="border-b border-border text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Origem
              </th>
              {["Leads", "Em aberto", "Perdidos", "Parceiros ativos", "Conversão"].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-3 text-right font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.rows.map((row) => (
              <tr key={row.source} className={row.source === "total" ? "font-semibold" : undefined}>
                <th scope="row" className="px-4 py-3 font-[inherit]">
                  {row.label}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{int.format(row.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{int.format(row.open)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{int.format(row.lost)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{int.format(row.active)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.rate === null ? "—" : `${pct.format(row.rate)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">Conversão = parceiros ativos ÷ leads da origem, entre os leads cadastrados no período.</p>
    </div>
  );
}
