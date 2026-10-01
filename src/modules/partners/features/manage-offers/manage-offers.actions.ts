"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withRole } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { endOffer, saveOffer } from "../../composition";
import type { Offer } from "../../domain/offer";
import { asOfferAuthor } from "./offer-author";
import { offerIdSchema, offerSchema } from "./offer.schema";

const save = formAction(
  offerSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, (author) => saveOffer().execute(author, input.offerId, input.draft))),
  { name: "partners.save-offer", keepValues: ["offerId", "target", "title", "description", "startsAt", "endsAt", "maxRedemptions"] },
);

export async function saveOfferAction(previous: FormState<Offer>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath("/parceiro/ofertas");
    redirect(`/parceiro/ofertas?salvo=${state.data.id}`);
  }
  return state;
}

const end = formAction(
  offerIdSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, (author) => endOffer().execute(author, input.offerId))),
  { name: "partners.end-offer" },
);

export async function endOfferAction(previous: FormState<Offer>, formData: FormData) {
  const state = await end(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/ofertas");
  return state;
}
