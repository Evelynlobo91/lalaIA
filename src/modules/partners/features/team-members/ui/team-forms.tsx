"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { inviteTeamMemberAction, removeTeamMemberAction } from "../team-members.actions";
import type { TeamMember } from "../team-members.use-case";

/** Convidar um funcionário pelo e-mail (#158). */
export function InviteMemberForm() {
  const [state, action, pending] = useActionState<FormState<TeamMember>, FormData>(inviteTeamMemberAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Convidar para a equipe" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">{state.data.email} agora faz parte da equipe.</FormAlert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <TextField
            label="E-mail do funcionário"
            name="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            required
            defaultValue={state.status === "error" ? state.values?.email : ""}
            errors={errors.email}
            key={state.status === "success" ? state.data.id : "email"}
          />
        </div>
        <Button type="submit" loading={pending}>
          Convidar
        </Button>
      </div>
    </form>
  );
}

/** Remover um membro: o acesso dele acaba na hora. */
export function RemoveMemberButton({ memberId, email }: { memberId: string; email: string }) {
  const [state, action, pending] = useActionState<FormState<{ memberId: string }>, FormData>(removeTeamMemberAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} aria-label={`Remover ${email} da equipe`}>
        Remover
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível remover."}</FormAlert>}
    </form>
  );
}
