"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { ok } from "@/shared/kernel";
import { redeemOffer } from "../../composition";

export type RedeemedCode = { code: string };

// O id de quem resgata vem sempre da sessão (withUser), nunca do formulário.
const redeem = formAction(
  z.object({ offerId: z.uuid({ error: "Oferta inválida." }) }),
  withUser(async (input, user) => {
    const result = await redeemOffer().execute(user.id, input.offerId);
    return result.ok ? ok({ code: result.value.redemption.code }) : result;
  }),
  { name: "partners.redeem-offer" },
);

export async function redeemOfferAction(previous: FormState<RedeemedCode>, formData: FormData) {
  const state = await redeem(previous, formData);
  if (state.status === "success") revalidatePath("/perfil");
  return state;
}
