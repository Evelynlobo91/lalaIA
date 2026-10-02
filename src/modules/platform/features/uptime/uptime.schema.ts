import { z } from "zod";

/** Formato público do /api/health (o monitor externo e os testes validam contra ele). Sem detalhes internos. */
export const healthReportSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  checkedAt: z.iso.datetime(),
  version: z.string().max(64),
  checks: z.array(
    z.object({ name: z.string().max(40), critical: z.boolean(), status: z.enum(["ok", "fail"]), latencyMs: z.number().int().min(0) }),
  ),
});

/** "ok" e "degraded" respondem 200 (o app atende); "down" responde 503 (o monitor alerta). */
export const httpStatusFor = (status: z.infer<typeof healthReportSchema>["status"]) => (status === "down" ? 503 : 200);
