import { z } from "zod";
import { candidatesParams, toConstraintsInput } from "../rec-candidates/rec-candidates.schema";

export const DEFAULT_RECOMMENDATION_LIMIT = 20;

/** GET /api/recommendations — mesmas restrições explícitas dos candidatos + `limite` (1 a 50). */
export const recScoreSchema = candidatesParams
  .extend({ limite: z.coerce.number().int().min(1).max(50).default(DEFAULT_RECOMMENDATION_LIMIT) })
  .transform((v, ctx) => ({ limit: v.limite, constraints: toConstraintsInput(v, ctx) }));

export type RecScoreInput = z.infer<typeof recScoreSchema>;
