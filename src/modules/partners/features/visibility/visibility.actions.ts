"use server";

import { revalidatePath } from "next/cache";
import { withRole } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { endSponsorship, startSponsorship } from "../../composition";
import { asOfferAuthor } from "../manage-offers/offer-author";
import { sponsorshipIdSchema, startSponsorshipSchema, type Sponsorship } from "./visibility.use-cases";

// O parceiro (aprovado) vem sempre da sessão; os casos de uso conferem a posse do alvo e o plano.
const start = formAction(
  startSponsorshipSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, (sponsor) => startSponsorship().execute(sponsor, input.target, input.days))),
  { name: "partners.start-sponsorship", keepValues: ["target", "days"] },
);

const end = formAction(
  sponsorshipIdSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, (sponsor) => endSponsorship().execute(sponsor, input.sponsorshipId))),
  { name: "partners.end-sponsorship" },
);

export async function startSponsorshipAction(previous: FormState<Sponsorship>, formData: FormData) {
  const state = await start(previous, formData);
  // O destaque muda a ordem das sugestões em todo o app.
  if (state.status === "success") revalidatePath("/", "layout");
  return state;
}

export async function endSponsorshipAction(previous: FormState<Sponsorship>, formData: FormData) {
  const state = await end(previous, formData);
  if (state.status === "success") revalidatePath("/", "layout");
  return state;
}
