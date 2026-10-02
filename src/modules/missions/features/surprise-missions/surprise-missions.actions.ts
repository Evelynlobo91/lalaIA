"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { offerSurpriseMission, respondSurpriseOffer } from "../../composition";
import { findSurpriseSchema, respondSurpriseSchema } from "./surprise-missions.schema";
import type { SurpriseResponse, SurpriseTeaser } from "./surprise-missions.use-case";

const find = formAction(
  findSurpriseSchema,
  // A posição vive só nesta chamada: não é gravada nem logada. O id vem da sessão.
  withUser((input, user) => offerSurpriseMission().findNear(user.id, { lat: input.lat, lon: input.lon })),
  { name: "missions.find-surprise" },
);

/** "Procurar missão surpresa" (POST): cria a oferta, se houver uma por perto. */
export async function findSurpriseAction(previous: FormState<SurpriseTeaser | null>, formData: FormData) {
  const state = await find(previous, formData);
  if (state.status === "success" && state.data) revalidatePath("/missoes");
  return state;
}

const respond = formAction(
  respondSurpriseSchema,
  withUser((input, user) => respondSurpriseOffer().execute(user.id, input.missionId, input.decision)),
  { name: "missions.respond-surprise" },
);

/** Aceitar (leva à missão, que começa a revelar as etapas) ou ignorar (a oferta some e não volta). */
export async function respondSurpriseAction(previous: FormState<SurpriseResponse>, formData: FormData) {
  const state = await respond(previous, formData);
  if (state.status === "success") {
    revalidatePath("/missoes", "layout");
    if (state.data.decision === "accept") {
      revalidatePath("/perfil");
      redirect(`/missoes/${state.data.missionId}?aceita=1`);
    }
  }
  return state;
}
