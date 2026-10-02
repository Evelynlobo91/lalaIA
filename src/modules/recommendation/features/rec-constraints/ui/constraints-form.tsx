import { LocateOff, MapPin } from "lucide-react";
import Link from "next/link";
import { NearMeButton } from "@/modules/places";
import { cn } from "@/shared/ui";
import { budgetChoices, budgetLabel, experienceTypes, peopleLabel, peopleOptions, timeLabel, timeOptions } from "../../../domain/experience-types";
import { constraintsHref, type ConstraintState } from "../rec-constraints.use-case";

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium",
    active ? "border-brand bg-brand text-brand-fg" : "border-border hover:bg-surface",
  );

type Option<T> = { value: T; label: string };

function ChipGroup<T>({ label, options, isActive, hrefFor }: { label: string; options: Option<T>[]; isActive: (v: T) => boolean; hrefFor: (v: T) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-1 sm:flex-wrap">
          {options.map((o) => (
            <li key={o.label}>
              <Link href={hrefFor(o.value)} aria-current={isActive(o.value) ? "true" : undefined} className={chip(isActive(o.value))} scroll={false}>
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * RF43 — Restrições em chips (links: funcionam sem JavaScript e o estado fica na URL, compartilhável).
 * Já vem preenchido com o perfil, então ajustar tempo, orçamento e tipo leva no máximo 3 toques.
 * A localização é opcional: pedida só no toque, arredondada (~10 m) e nunca gravada.
 */
export function ConstraintsForm({ state, basePath = "/sugestoes" }: { state: ConstraintState; basePath?: string }) {
  const href = (change: Partial<ConstraintState>) => constraintsHref(state, change, basePath);
  return (
    <section aria-label="Suas restrições" className="flex flex-col gap-4">
      <ChipGroup
        label="Quanto tempo você tem?"
        options={timeOptions.map((v) => ({ value: v, label: timeLabel(v) }))}
        isActive={(v) => v === state.tempo}
        hrefFor={(tempo) => href({ tempo })}
      />
      <ChipGroup
        label="Quanto quer gastar (no total)?"
        options={budgetChoices.map((v) => ({ value: v, label: budgetLabel(v) }))}
        isActive={(v) => v === state.orcamento}
        hrefFor={(orcamento) => href({ orcamento })}
      />
      <ChipGroup
        label="Quantas pessoas?"
        options={peopleOptions.map((v) => ({ value: v, label: peopleLabel(v) }))}
        isActive={(v) => v === state.pessoas}
        hrefFor={(pessoas) => href({ pessoas })}
      />
      <ChipGroup
        label="Que tipo de experiência?"
        options={experienceTypes.map((t) => ({ value: t.id, label: t.label }))}
        isActive={(v) => v === state.tipo}
        hrefFor={(tipo) => href({ tipo })}
      />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Onde você está?</h2>
        {state.origin ? (
          <p className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 font-medium">
              <MapPin aria-hidden className="size-4 text-brand" /> Usando sua localização aproximada
            </span>
            <Link href={href({ origin: null })} className="inline-flex items-center gap-1 font-medium text-brand underline" scroll={false}>
              <LocateOff aria-hidden className="size-4" /> Remover localização
            </Link>
          </p>
        ) : (
          <NearMeButton target={href({ origin: null })} label="Usar minha localização" />
        )}
      </div>
    </section>
  );
}

/** Resumo legível: "2 h · Até R$ 70 · 2 pessoas · Algo diferente". */
export function constraintsSummary(state: ConstraintState): string {
  const tipo = experienceTypes.find((t) => t.id === state.tipo)!;
  return [timeLabel(state.tempo), budgetLabel(state.orcamento), peopleLabel(state.pessoas), tipo.label].join(" · ");
}
