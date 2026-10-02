"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { internalRoleDescriptions, internalRoleLabels } from "../../../domain/capabilities";
import type { Role } from "../../../domain/roles";
import { setTeamRolesAction } from "../manage-team-roles.action";
import { teamRoles, type TeamRole } from "../manage-team-roles";

/** Papéis internos de uma pessoa (#157): o admin marca os que ela deve ter e salva. */
export function TeamRolesForm({ userId, displayName, roles }: { userId: string; displayName: string; roles: Role[] }) {
  const [state, action, pending] = useActionState<FormState<{ userId: string; roles: TeamRole[] }>, FormData>(setTeamRolesAction, idleFormState);
  const current: readonly string[] = state.status === "success" ? state.data.roles : roles;

  return (
    <form action={action} className="flex flex-col gap-3" aria-label={`Papéis de ${displayName}`}>
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Papéis no time</legend>
        {teamRoles.map((role) => (
          <label key={role} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="roles" value={role} defaultChecked={current.includes(role)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">{internalRoleLabels[role]}</span>
              <span className="block text-muted">{internalRoleDescriptions[role]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível salvar os papéis."}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Papéis atualizados.</FormAlert>}
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
        Salvar papéis
      </Button>
    </form>
  );
}
