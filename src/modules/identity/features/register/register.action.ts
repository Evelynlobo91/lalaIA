"use server";

import { domainEvents } from "@/shared/events";
import { publicEnv } from "@/shared/config/public-env";
import { formAction, type FormState } from "@/shared/http/form-action";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSignUpGateway } from "../../infra/supabase-sign-up-gateway";
import { registerSchema } from "./register.schema";
import { RegisterUser, type RegisterResult } from "./register.use-case";

const handle = formAction(
  registerSchema,
  async (input) => {
    const useCase = new RegisterUser(new SupabaseSignUpGateway(await createSupabaseServerClient()), domainEvents());
    return useCase.execute(input, `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`);
  },
  { name: "identity.register", keepValues: ["displayName", "email"] },
);

export async function registerAction(previous: FormState<RegisterResult>, formData: FormData): Promise<FormState<RegisterResult>> {
  return handle(previous, formData);
}
