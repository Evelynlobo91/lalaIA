"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useId, useState, type FormEvent, type ReactNode } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { MAX_STEPS, MAX_XP, MIN_XP, type MissionRecord } from "../../../domain/mission";
import { saveMissionAction } from "../manage-missions.actions";

export type MissionFormStep = { title: string; placeId: string };
export type MissionFormValues = {
  missionId?: string;
  title: string;
  description: string;
  xp: string;
  startsAt: string;
  endsAt: string;
  steps: MissionFormStep[];
};
export type PlaceOption = { id: string; label: string };

type Row = MissionFormStep & { key: number };

// Chave estável das linhas do editor (reordenar/remover sem perder o foco).
let rowSeq = 0;

/**
 * Formulário de missão com editor de etapas (adicionar, remover, reordenar).
 * `placeOptions` são os lugares que quem cria pode usar (no portal: os que o parceiro administra).
 * Envio manual (sem `action` no <form>): o React não limpa os campos depois de um erro de validação.
 */
export function MissionForm({ initial, placeOptions, submitLabel, stepsLocked = false }: { initial?: MissionFormValues; placeOptions: PlaceOption[]; submitLabel: string; stepsLocked?: boolean }) {
  const [state, dispatch, pending] = useActionState<FormState<MissionRecord>, FormData>(saveMissionAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<MissionFormValues> = state.status === "error" ? (state.values ?? {}) : (initial ?? {});
  const newRow = (step: MissionFormStep = { title: "", placeId: placeOptions.length === 1 ? placeOptions[0].id : "" }): Row => ({ ...step, key: rowSeq++ });
  const [rows, setRows] = useState<Row[]>(() => (initial?.steps.length ? initial.steps : [undefined]).map((s) => newRow(s)));
  const id = useId();

  const update = (key: number, patch: Partial<MissionFormStep>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const copy = [...rs];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {values.missionId && <input type="hidden" name="missionId" value={values.missionId} />}
      <input type="hidden" name="steps" value={JSON.stringify(rows.map(({ title, placeId }) => ({ title, placeId, validation: "qr" })))} />
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <TextField label="Título" name="title" maxLength={120} required defaultValue={values.title} errors={errors.title} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Descrição
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          defaultValue={values.description}
          aria-invalid={errors.description ? true : undefined}
          className="rounded-xl border border-border bg-bg px-4 py-3 text-base font-normal aria-invalid:border-danger"
        />
        {errors.description && <span className="text-sm font-normal text-danger">{errors.description[0]}</span>}
      </label>

      <TextField
        label="XP total"
        name="xp"
        type="number"
        inputMode="numeric"
        min={MIN_XP}
        max={MAX_XP}
        step={1}
        required
        readOnly={stepsLocked}
        defaultValue={values.xp ?? "100"}
        errors={errors.xp}
        hint="Dividido entre as etapas e um bônus para quem concluir a missão."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Começa em" name="startsAt" type="datetime-local" required defaultValue={values.startsAt} errors={errors.startsAt} />
        <TextField label="Termina em" name="endsAt" type="datetime-local" required defaultValue={values.endsAt} errors={errors.endsAt} />
      </div>
      <p className="-mt-3 text-sm text-muted">Horário de Joinville.</p>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.steps ? `${id}-erros-etapas` : undefined}>
        <legend className="mb-1 text-lg font-semibold">Etapas</legend>
        {stepsLocked && <p className="text-sm text-muted">Esta missão já foi aceita por exploradores: as etapas e o XP não podem mais mudar.</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={row.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Etapa {i + 1}</span>
                {!stepsLocked && (
                  <div className="flex gap-1">
                    <IconButton label={`Subir etapa ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp aria-hidden className="size-4" />} />
                    <IconButton label={`Descer etapa ${i + 1}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown aria-hidden className="size-4" />} />
                    <IconButton label={`Remover etapa ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} icon={<Trash2 aria-hidden className="size-4" />} />
                  </div>
                )}
              </div>
              <TextField
                label={`O que fazer na etapa ${i + 1}`}
                placeholder="Ex.: Peça o café especial da casa"
                maxLength={80}
                value={row.title}
                readOnly={stepsLocked}
                onChange={(e) => update(row.key, { title: e.target.value })}
              />
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Lugar da etapa {i + 1}
                <select
                  value={row.placeId}
                  disabled={stepsLocked}
                  onChange={(e) => update(row.key, { placeId: e.target.value })}
                  className="h-12 rounded-xl border border-border bg-bg px-3 text-base font-normal"
                >
                  <option value="" disabled>
                    Escolha o lugar
                  </option>
                  {placeOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-muted">Validação: QR code no balcão.</p>
            </li>
          ))}
        </ol>
        {!stepsLocked && rows.length < MAX_STEPS && (
          <Button type="button" variant="secondary" className="self-start" onClick={() => setRows((rs) => [...rs, newRow()])}>
            <Plus aria-hidden className="size-4" /> Adicionar etapa
          </Button>
        )}
        {errors.steps && (
          <ul id={`${id}-erros-etapas`} className="flex flex-col gap-0.5 text-sm text-danger" aria-live="polite">
            {errors.steps.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </fieldset>

      <Button type="submit" size="lg" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

function IconButton({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex size-11 items-center justify-center rounded-xl hover:bg-surface-2 disabled:opacity-40">
      {icon}
    </button>
  );
}
