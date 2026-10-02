"use server";

import { revalidatePath } from "next/cache";
import { withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { confirmPaymentManually } from "../../composition";
import { billingActor } from "../plans/billing-actor";
import { confirmPaymentSchema } from "./confirm-payment.use-case";

// withCapability confere na action; o caso de uso confere de novo; o banco (RLS) por último.
const confirm = formAction(
  confirmPaymentSchema,
  withCapability("billing:write", (input, user) => confirmPaymentManually().execute(billingActor(user), input.invoiceId)),
  { name: "billing.confirmPaymentManually" },
);

export async function confirmPaymentAction(previous: FormState<{ invoiceId: string }>, formData: FormData) {
  const state = await confirm(previous, formData);
  // O plano pago passa a valer: muda o que o parceiro pode fazer em todo o app.
  if (state.status === "success") revalidatePath("/", "layout");
  return state;
}
