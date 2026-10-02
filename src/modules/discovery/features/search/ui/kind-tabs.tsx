import Link from "next/link";
import { cn } from "@/shared/ui";
import { kindLabels, resultKinds, type ResultKind } from "../../../domain/search";
import { toQueryString } from "../search-url";

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
    active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:border-brand",
  );

/** Atalhos Todos / Lugares / Eventos. Links (funcionam sem JavaScript) que mantêm a busca e os filtros da URL. */
export function KindTabs({ active, keep }: { active: ResultKind | null; keep: Record<string, string> }) {
  const href = (tipo: ResultKind | null) => `/buscar?${toQueryString({ ...keep, tipo })}`;
  return (
    <nav aria-label="Tipo de resultado" className="flex flex-wrap gap-2">
      <Link href={href(null)} aria-current={!active ? "true" : undefined} className={chip(!active)}>
        Todos
      </Link>
      {resultKinds.map((kind) => (
        <Link key={kind} href={href(kind)} aria-current={active === kind ? "true" : undefined} className={chip(active === kind)}>
          {kindLabels[kind]}
        </Link>
      ))}
    </nav>
  );
}
