"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { geofenceCheckIn } from "../../composition";
import type { GeofenceCheckInResult } from "./geofence-validation.use-case";
import { geofenceCheckInSchema } from "./geofence-validation.schema";

const checkIn = formAction(
  geofenceCheckInSchema,
  // O id do usuário vem da sessão (withUser), nunca do formulário. A coordenada não vai para o log.
  withUser((input, user) => geofenceCheckIn().execute(user.id, input)),
  { name: "missions.geofence-check-in" },
);

/** POST do botão "Fazer check-in" (Server Action: protegida contra CSRF pelo Next). */
export async function geofenceCheckInAction(previous: FormState<GeofenceCheckInResult>, formData: FormData) {
  const state = await checkIn(previous, formData);
  if (state.status === "success" && state.data.status === "completed") {
    revalidatePath("/missoes", "layout");
    revalidatePath("/perfil");
    redirect(`/missoes/${state.data.missionId}?etapa=${state.data.stepId}`);
  }
  return state;
}
