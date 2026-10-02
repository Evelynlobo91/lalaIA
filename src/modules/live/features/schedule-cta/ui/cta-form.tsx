"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { CTA_LIMITS as L, CTA_PRIORITIES, CTA_PRIORITY_LABELS, CTA_TYPES, CTA_TYPE_LABELS, type CtaRecord, type CtaScheduleKind, type CtaType } from "../../../domain/cta";
import { saveCtaAction } from "../schedule-cta.actions";
import type { CtaFormOptions } from "../schedule-cta.use-case";

export type CtaFormValues = {
  ctaId?: string;
  type: string;
  refId: string;
  url: string;
  title: string;
  body: string;
  buttonLabel: string;
  priority: string;
  scheduleKind: string;
  startsAt: string;
  endsAt: string;
  offsetMinutes: string;
  durationMinutes: string;
  intervalMinutes: string;
};

const selectClass = "h-12 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base font-normal aria-invalid:border-danger";

const SCHEDULE_LABELS: Record<CtaScheduleKind, string> = {
  absolute: "Em um horário marcado",
  relative: "Depois que a live entrar no ar",
  recurring: "De tempos em tempos durante a live",
};

const REF_LABELS: Partial<Record<CtaType, string>> = { promocao: "Qual oferta", missao: "Qual missão", evento: "Qual evento" };
const EMPTY_HINTS: Partial<Record<CtaType, string>> = {
  promocao: "Você não tem ofertas valendo ou agendadas. Crie uma em Ofertas.",
  missao: "Você não tem missões ativas. Crie uma em Missões.",
  evento: "Você não tem eventos por vir. Crie um em Eventos.",
};

/**
 * Formulário de CTA (#178): tipo, conteúdo, prioridade e quando aparece. Os campos mudam com o tipo e o
 * agendamento. Envio manual (sem `action` no <form>): o React não limpa os campos depois de um erro.
 */
export function CtaForm({ streamId, options, initial, submitLabel }: { streamId: string; options: CtaFormOptions; initial?: CtaFormValues; submitLabel: string }) {
  const [state, dispatch, pending] = useActionState<FormState<CtaRecord>, FormData>(saveCtaAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<CtaFormValues> = state.status === "error" ? { ...initial, ...state.values } : (initial ?? {});
  const [type, setType] = useState<CtaType>((initial?.type as CtaType) ?? "promocao");
  const [kind, setKind] = useState<CtaScheduleKind>((initial?.scheduleKind as CtaScheduleKind) ?? "absolute");
  const [button, setButton] = useState(initial?.buttonLabel ?? options.promocao.defaultButton);
  const current = options[type];

  const changeType = (next: CtaType) => {
    // O texto do botão acompanha o tipo enquanto o parceiro não escreveu o dele.
    if (button === options[type].defaultButton) setButton(options[next].defaultButton);
    setType(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label={initial?.ctaId ? "Editar chamada" : "Nova chamada"} noValidate>
      <input type="hidden" name="streamId" value={streamId} />
      {initial?.ctaId && <input type="hidden" name="ctaId" value={initial.ctaId} />}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tipo
          <select name="type" value={type} onChange={(e) => changeType(e.target.value as CtaType)} className={selectClass} aria-invalid={errors.type ? true : undefined}>
            {CTA_TYPES.map((t) => (
              <option key={t} value={t}>
                {CTA_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {errors.type && <span className="text-sm font-normal text-danger">{errors.type[0]}</span>}
        </label>

        {current.field === "ref" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {REF_LABELS[type]}
            <select key={type} name="refId" defaultValue={values.refId ?? ""} className={selectClass} aria-invalid={errors.refId ? true : undefined}>
              <option value="" disabled>
                Escolha
              </option>
              {current.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.refId ? <span className="text-sm font-normal text-danger">{errors.refId[0]}</span> : current.options.length === 0 && <span className="text-sm font-normal text-muted">{EMPTY_HINTS[type]}</span>}
          </label>
        )}
        {current.field === "url" && (
          <TextField label="Endereço (https)" name="url" type="url" inputMode="url" maxLength={500} placeholder="https://instagram.com/seubar" defaultValue={values.url ?? ""} errors={errors.url} hint="Reserva, cardápio ou rede social do seu negócio." />
        )}
        {current.field === "none" && <p className="self-end text-sm text-muted">Abre a rota até o lugar no app de mapas e conta como “Quero ir”.</p>}
      </div>

      <TextField label="Título" name="title" maxLength={L.title.max} required placeholder="Chope em dobro até 21h" defaultValue={values.title ?? ""} errors={errors.title} />
      <TextField label="Texto (opcional)" name="body" maxLength={L.body.max} placeholder="Mostre o código no balcão." defaultValue={values.body ?? ""} errors={errors.body} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Texto do botão" name="buttonLabel" maxLength={L.buttonLabel.max} required value={button} onChange={(e) => setButton(e.target.value)} errors={errors.buttonLabel} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Prioridade
          <select key={values.priority ?? "2"} name="priority" defaultValue={values.priority ?? "2"} className={selectClass}>
            {CTA_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {CTA_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <span className="text-sm font-normal text-muted">Se duas chamadas coincidirem, aparece a de maior prioridade.</span>
        </label>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Quando aparece</legend>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Agendamento
          <select name="scheduleKind" value={kind} onChange={(e) => setKind(e.target.value as CtaScheduleKind)} className={selectClass}>
            {(Object.keys(SCHEDULE_LABELS) as CtaScheduleKind[]).map((k) => (
              <option key={k} value={k}>
                {SCHEDULE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {kind === "absolute" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Começa em" name="startsAt" type="datetime-local" required defaultValue={values.startsAt ?? ""} errors={errors.startsAt} />
            <TextField label="Termina em" name="endsAt" type="datetime-local" required defaultValue={values.endsAt ?? ""} errors={errors.endsAt} hint="Horário de Joinville." />
          </div>
        )}
        {kind === "relative" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Minutos depois de entrar ao vivo" name="offsetMinutes" inputMode="numeric" required defaultValue={values.offsetMinutes ?? "15"} errors={errors.offsetMinutes} />
            <TextField label="Fica por (minutos)" name="durationMinutes" inputMode="numeric" required defaultValue={values.durationMinutes ?? "10"} errors={errors.durationMinutes} />
          </div>
        )}
        {kind === "recurring" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="A cada (minutos)" name="intervalMinutes" inputMode="numeric" required defaultValue={values.intervalMinutes ?? "30"} errors={errors.intervalMinutes} />
            <TextField label="Fica por (minutos)" name="durationMinutes" inputMode="numeric" required defaultValue={values.durationMinutes ?? "5"} errors={errors.durationMinutes} />
          </div>
        )}
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
