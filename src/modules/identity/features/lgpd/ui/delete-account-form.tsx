"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { deleteAccountAction } from "../lgpd.actions";
import { CONFIRMATION_WORD } from "../lgpd.schema";

/** Exclusão definitiva da conta, com confirmação digitada (evita clique acidental). */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState<{ deleted: true }>, FormData>(deleteAccountAction, idleFormState);
  const errors = state.status === "error" ? state.fieldErrors?.confirmacao : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && !errors && <FormAlert>{state.message ?? "Não foi possível excluir agora. Tente de novo."}</FormAlert>}
      <TextField
        name="confirmacao"
        label={`Digite ${CONFIRMATION_WORD} para confirmar`}
        autoComplete="off"
        errors={errors}
        hint="Apaga seu perfil, preferências, favoritos, missões, XP e, se for parceiro, seus eventos e transmissões. Não dá para desfazer."
      />
      <Button type="submit" variant="danger" loading={pending} className="self-start">
        Excluir minha conta
      </Button>
    </form>
  );
}
