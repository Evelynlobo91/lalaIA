// API pública do módulo platform (saúde e operação da aplicação).
import { checkHealth } from "./composition";
import { healthRoutes } from "./features/uptime/uptime.route";

export type { HealthReport, OverallStatus } from "./domain/health";
export { HealthStatusView } from "./features/uptime/ui/health-status-view";

/** Situação atual das dependências (página /status). */
export function healthReport() {
  return checkHealth().execute();
}

/** GET/HEAD /api/health. */
export const platformApi = { health: healthRoutes(checkHealth) };
