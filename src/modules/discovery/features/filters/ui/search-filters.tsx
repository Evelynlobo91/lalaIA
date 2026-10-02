"use client";

import { SlidersHorizontal } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Button, cn } from "@/shared/ui";
import { searchHref } from "../../search/search-url";
import type { FilterOption, FilterOptions } from "../filters.use-case";

// Nomes dos parâmetros (iguais aos do filters.schema, sem importar zod/servidor no cliente).
const FIELDS = ["categoria", "bairro", "quando", "horario", "preco"] as const;
type Field = (typeof FIELDS)[number];

type SearchFiltersProps = {
  options: FilterOptions;
  /** Valores ativos na URL (ex.: { categoria: "bares", quando: "2026-10-10" }). */
  active: Partial<Record<Field, string>>;
  /** Parâmetros que os filtros mantêm (busca e tipo). */
  keep: Record<string, string>;
};

const control = "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-fg";

function Select({ name, label, options, value, anyLabel }: { name: Field; label: string; options: FilterOption[]; value?: string; anyLabel: string }) {
  const id = `filtro-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={cn(control, value && "border-brand")}>
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Painel de filtros (RF05). Sem JavaScript, é um formulário GET para /buscar. Com JavaScript, cada mudança já
 * aplica o filtro e a URL fica limpa (só os filtros escolhidos), pronta para compartilhar.
 */
export function SearchFilters({ options, active, keep }: SearchFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const count = FIELDS.filter((f) => active[f]).length;
  const specificDate = active.quando && /^\d{4}-\d{2}-\d{2}$/.test(active.quando) ? active.quando : undefined;

  function apply(form: HTMLFormElement, changed?: string) {
    const data = new FormData(form);
    // Escolher um atalho de data limpa a data específica, e vice-versa.
    if (changed === "quando") data.delete("data");
    const values: Record<string, string> = { ...keep };
    for (const field of FIELDS) {
      const value = String(data.get(field) ?? "");
      if (value) values[field] = value;
    }
    const date = String(data.get("data") ?? "");
    if (date) values.quando = date;
    startTransition(() => router.push(searchHref(values), { scroll: false }));
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    apply(e.currentTarget);
  };

  return (
    <details open={count > 0 || undefined} className="group rounded-2xl border border-border bg-surface shadow-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 font-semibold text-brand">
        <SlidersHorizontal aria-hidden className="size-4" />
        Filtros{count > 0 ? ` (${count})` : ""}
      </summary>
      <Form
        action="/buscar"
        onSubmit={onSubmit}
        onChange={(e) => apply(e.currentTarget, (e.target as unknown as HTMLInputElement).name)}
        aria-busy={pending || undefined}
        className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Select name="categoria" label="Categoria" anyLabel="Todas" options={options.categorias} value={active.categoria} />
        <Select name="bairro" label="Bairro" anyLabel="Toda Joinville" options={options.bairros} value={active.bairro} />
        <Select
          name="quando"
          label="Quando"
          anyLabel="Qualquer data"
          options={specificDate ? [...options.datas, { value: specificDate, label: "Na data escolhida" }] : options.datas}
          value={active.quando}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-data" className="text-sm font-medium">
            Ou uma data
          </label>
          <input id="filtro-data" type="date" name="data" defaultValue={specificDate} className={cn(control, specificDate && "border-brand")} />
        </div>
        <Select name="horario" label="Horário" anyLabel="Qualquer horário" options={options.horarios} value={active.horario} />
        <Select name="preco" label="Preço (eventos)" anyLabel="Qualquer preço" options={options.precos} value={active.preco} />
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="secondary" loading={pending}>
            Aplicar filtros
          </Button>
        </div>
      </Form>
    </details>
  );
}
