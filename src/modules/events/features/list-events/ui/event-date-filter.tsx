import Link from "next/link";
import { Button, cn } from "@/shared/ui";
import { dateFilterLabels, type DateFilter } from "../../../domain/date-window";

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
    active ? "border-brand bg-brand text-brand-fg" : "border-border hover:bg-surface",
  );

/**
 * Filtro de data da lista de eventos (RF15): atalhos + data específica. Funciona sem JavaScript
 * (links e formulário GET), e o estado fica na URL (compartilhável).
 */
export function EventDateFilter({ active, basePath = "/eventos" }: { active: DateFilter | null; basePath?: string }) {
  return (
    <nav aria-label="Filtrar por data" className="flex flex-wrap items-center gap-2">
      <Link href={basePath} aria-current={!active ? "true" : undefined} className={chip(!active)}>
        Todos
      </Link>
      {(Object.keys(dateFilterLabels) as Array<keyof typeof dateFilterLabels>).map((kind) => (
        <Link key={kind} href={`${basePath}?quando=${kind}`} aria-current={active?.kind === kind ? "true" : undefined} className={chip(active?.kind === kind)}>
          {dateFilterLabels[kind]}
        </Link>
      ))}
      <form action={basePath} className="flex items-center gap-2">
        <label htmlFor="data-evento" className="sr-only">
          Escolher uma data
        </label>
        <input
          id="data-evento"
          type="date"
          name="quando"
          defaultValue={active?.kind === "data" ? active.date : undefined}
          className={cn("h-11 rounded-full border px-4 text-sm", active?.kind === "data" ? "border-brand" : "border-border", "bg-bg")}
        />
        <Button type="submit" size="sm" variant="secondary">
          Ver
        </Button>
      </form>
    </nav>
  );
}
