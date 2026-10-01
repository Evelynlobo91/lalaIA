import { X } from "lucide-react";
import Link from "next/link";

export type ActiveFilterChip = { label: string; removeHref: string };

/** Filtros ativos como chips removíveis + "Limpar filtros" (links: funcionam sem JavaScript). */
export function ActiveFilters({ chips, clearHref }: { chips: ActiveFilterChip[]; clearHref: string }) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label="Filtros ativos" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.removeHref}
          aria-label={`Remover filtro ${chip.label}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand bg-brand px-4 text-sm font-medium text-brand-fg"
        >
          {chip.label}
          <X aria-hidden className="size-4" />
        </Link>
      ))}
      <Link href={clearHref} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4">
        Limpar filtros
      </Link>
    </nav>
  );
}
