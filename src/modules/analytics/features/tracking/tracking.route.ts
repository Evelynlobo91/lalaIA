import { ok } from "@/shared/kernel";
import { jsonRoute } from "@/shared/http/json-route";
import { trackInteraction } from "../../composition";
import { trackUiSchema } from "./tracking.schema";
import { ANALYTICS_OPT_OUT } from "./tracking.use-case";

/**
 * POST /api/analytics/track — 202: aceito; a gravação acontece depois da resposta.
 * Navegador com "métricas de uso" desligadas (cookie do consentimento, #25): responde 202 e não grava.
 */
export const trackRoute = jsonRoute(
  trackUiSchema,
  async (input, request) => (ANALYTICS_OPT_OUT.test(request.headers.get("cookie") ?? "") ? ok({ accepted: true as const }) : trackInteraction().fromUi(input)),
  { successStatus: 202 },
);
