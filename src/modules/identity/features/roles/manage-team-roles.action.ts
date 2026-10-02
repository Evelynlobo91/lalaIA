"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { formAction, type FormState } from "@/shared/http/form-action";
import { PostgresRoleRepository } from "../../infra/postgres-role-repository";
import { withCapability } from "../authorization/authorization";
import { SetTeamRoles, teamRolesSchema, type TeamRole } from "./manage-team-roles";

// withCapability confere na action; o caso de uso confere de novo.
const handle = formAction(
  teamRolesSchema,
  withCapability("roles:manage", (input, user) => new SetTeamRoles(new PostgresRoleRepository(sql()), domainEvents()).execute(user, input.userId, input.roles)),
  { name: "identity.setTeamRoles", arrays: ["roles"] },
);

export async function setTeamRolesAction(previous: FormState<{ userId: string; roles: TeamRole[] }>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") revalidatePath("/admin/usuarios");
  return state;
}
