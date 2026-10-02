import { z } from "zod";
import { servicePointShape } from "@/modules/places";

/** "Procurar missão surpresa": posição do toque, arredondada e dentro da área atendida. */
export const findSurpriseSchema = z.object({ ...servicePointShape });

/** Resposta à oferta: aceitar ou ignorar. */
export const respondSurpriseSchema = z.object({
  missionId: z.uuid({ error: "Missão inválida." }),
  decision: z.enum(["accept", "dismiss"], { error: "Resposta inválida." }),
});
