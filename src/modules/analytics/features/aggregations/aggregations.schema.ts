import { z } from "zod";

const day = z.iso.date({ error: "Data inválida." });
const ids = z.array(z.uuid()).max(500);

/** Entrada das métricas diárias: até 500 ids por tipo e no máximo 366 dias. */
export const dailyMetricsSchema = z
  .object({
    refs: z.object({ place: ids.optional(), event: ids.optional(), mission: ids.optional(), live: ids.optional() }),
    from: day,
    to: day,
  })
  .refine((q) => q.from <= q.to, { message: "Período inválido.", path: ["from"] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 366, { message: "Período longo demais (máx. 366 dias).", path: ["to"] });

export type DailyMetricsInput = z.input<typeof dailyMetricsSchema>;
