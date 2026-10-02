"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { MAX_REWARD_STOCK, REWARD_DESCRIPTION, type MissionReward } from "../../../domain/reward";
import { saveRewardAction } from "../rewards.actions";

export type RewardFormValues = { description: string; stock: string };

/**
 * Vincular ou editar a recompensa da missão (portal). Envio manual (sem `action` no <form>):
 * o React não limpa os campos depois de um erro de validação.
 */
export function RewardForm({ missionId, initial }: { missionId: string; initial?: RewardFormValues }) {
  const [state, dispatch, pending] = useActionState<FormState<MissionReward>, FormData>(saveRewardAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<RewardFormValues> = state.status === "error" ? (state.values ?? {}) : (initial ?? {});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="missionId" value={missionId} />
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Recompensa salva.</FormAlert>}

      <TextField
        label="Recompensa"
        name="description"
        required
        minLength={REWARD_DESCRIPTION.min}
        maxLength={REWARD_DESCRIPTION.max}
        placeholder="Ex.: 1 chope grátis"
        defaultValue={values.description}
        errors={errors.description}
        hint="O que a pessoa ganha ao concluir a missão. Você entrega no balcão, conferindo o código."
      />
      <TextField
        label="Estoque total (opcional)"
        name="stock"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_REWARD_STOCK}
        step={1}
        defaultValue={values.stock}
        errors={errors.stock}
        hint="Deixe em branco para não ter limite. Cada pessoa resgata uma vez só."
      />
      <Button type="submit" loading={pending} className="self-start">
        {initial ? "Salvar recompensa" : "Vincular recompensa"}
      </Button>
    </form>
  );
}
