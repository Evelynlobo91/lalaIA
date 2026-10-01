import { z } from "zod";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

/** Filtros do painel na URL: `periodo` (7, 30 ou 90 dias) e `recurso` ("place:<id>", "event:<id>", "mission:<id>"). */
export const partnerDashboardSchema = z.object({
  periodo: z
    .enum(["7", "30", "90"], { error: "Período inválido." })
    .default("30")
    .transform((v) => Number(v) as Period),
  recurso: z
    .string()
    .regex(/^(place|event|mission):[0-9a-f-]{36}$/i, "Recurso inválido.")
    .optional(),
});

export type PartnerDashboardParams = z.infer<typeof partnerDashboardSchema>;
