import { z } from "zod";
import { MAX_REWARD_STOCK, REWARD_DESCRIPTION } from "../../domain/reward";

const missionId = z.uuid({ error: "Missão inválida." });

const stockNumber = z
  .number({ error: "Use um número." })
  .int("Use um número inteiro.")
  .min(1, "O estoque mínimo é 1.")
  .max(MAX_REWARD_STOCK, `O estoque máximo é ${MAX_REWARD_STOCK.toLocaleString("pt-BR")}.`);

/** Campo opcional: vazio = sem limite. */
const stock = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), z.string().transform(Number).pipe(stockNumber)]));

export const saveRewardSchema = z.object({
  missionId,
  description: z
    .string({ error: "Diga qual é a recompensa." })
    .trim()
    .min(REWARD_DESCRIPTION.min, "Diga qual é a recompensa (ex.: 1 chope grátis).")
    .max(REWARD_DESCRIPTION.max, `Use no máximo ${REWARD_DESCRIPTION.max} caracteres.`),
  stock,
});

export const claimRewardSchema = z.object({ missionId });

export const validateRewardCodeSchema = z.object({
  missionId,
  code: z.string().trim().min(1, "Digite o código.").max(20, "Código inválido."),
});
