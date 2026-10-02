"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { subscribe } from "../../composition";
import { subscribeSchema } from "./subscribe.use-cases";

export type SubscribeResult = { planName: string; paymentUrl: string | null };

// O id de quem assina vem sempre da sessão; o caso de uso confere se a conta é parceira.
const handle = formAction(
  subscribeSchema,
  withUser(async (input, user) => {
    const result = await subscribe().execute({ id: user.id, isPartner: hasRole(user, "partner") }, input.planId);
    // Só o que a tela precisa: o nome do plano e o link de pagamento, se houver fatura.
    return result.ok ? { ok: true as const, value: { planName: result.value.plan.name, paymentUrl: result.value.invoice?.paymentUrl ?? null } } : result;
  }),
  { name: "billing.subscribe" },
);

export async function subscribeAction(previous: FormState<SubscribeResult>, formData: FormData) {
  const state = await handle(previous, formData);
  // O plano muda o que o parceiro pode fazer no portal.
  if (state.status === "success") revalidatePath("/parceiro", "layout");
  return state;
}
