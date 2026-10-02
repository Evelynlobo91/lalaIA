import { jsonRoute } from "@/shared/http/json-route";
import { trackInteraction } from "../../composition";
import { trackUiSchema } from "./tracking.schema";

/** POST /api/analytics/track — 202: aceito; a gravação acontece depois da resposta. */
export const trackRoute = jsonRoute(trackUiSchema, async (input) => trackInteraction().fromUi(input), { successStatus: 202 });
