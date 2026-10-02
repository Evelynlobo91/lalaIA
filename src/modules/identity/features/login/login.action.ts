"use server";

import { redirect } from "next/navigation";
import { formAction, type FormState } from "@/shared/http/form-action";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";
import { loginSchema } from "./login.schema";
import { LoginUser, type LoginResult } from "./login.use-case";

const handle = formAction(loginSchema, async (input) => new LoginUser(new SupabaseSessionGateway(await createSupabaseServerClient())).execute(input), {
  name: "identity.login",
  keepValues: ["email"],
});

export async function loginAction(previous: FormState<LoginResult>, formData: FormData): Promise<FormState<LoginResult>> {
  const state = await handle(previous, formData);
  // redirect() lança uma exceção de controle do Next: fica fora do try/catch do formAction.
  if (state.status === "success") redirect(state.data.redirectTo);
  return state;
}
