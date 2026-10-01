import { withRole } from "@/modules/identity";
import { queryRoute } from "@/shared/http/json-route";
import { partnerDashboardSchema } from "./partner-dashboard.schema";
import type { PartnerDashboard } from "./partner-dashboard.use-case";

/** GET /api/partner/dashboard?periodo=&recurso= — só parceiros; dados apenas dos próprios recursos. */
export function partnerDashboardRoute(useCase: () => PartnerDashboard) {
  return queryRoute(
    partnerDashboardSchema,
    withRole("partner", (params, user) => useCase().execute(user.id, params)),
  );
}
