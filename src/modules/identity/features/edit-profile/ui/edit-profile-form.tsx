"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { editProfileAction } from "../edit-profile.action";

export function EditProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, action, pending] = useActionState<FormState<{ displayName: string }>, FormData>(editProfileAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const value = state.status === "error" ? state.values?.displayName : state.status === "success" ? state.data.displayName : displayName;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Dados atualizados.</FormAlert>}
      <TextField label="Nome" name="displayName" autoComplete="name" maxLength={80} required defaultValue={value} errors={errors.displayName} />
      <TextField label="E-mail" name="email" type="email" value={email} readOnly disabled hint="Para trocar o e-mail, fale com o suporte." />
      <Button type="submit" loading={pending} className="self-start">
        Salvar dados
      </Button>
    </form>
  );
}
