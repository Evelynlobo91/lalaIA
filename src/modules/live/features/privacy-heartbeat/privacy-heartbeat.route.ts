import "server-only";
import { jsonRoute } from "@/shared/http/json-route";
import { heartbeatSchema, type RecordAgentHeartbeat } from "./privacy-heartbeat.use-case";

/**
 * POST /api/live/agent/heartbeat — heartbeat do agente de borrão (#198). Autenticado por
 * `Authorization: Bearer <chave de transmissão>`. Chave errada → 401, sem dizer se a transmissão existe.
 */
export function agentHeartbeatRoute(useCase: () => RecordAgentHeartbeat) {
  return jsonRoute(heartbeatSchema, (input, request) => {
    const match = /^Bearer\s+(\S{16,200})$/.exec(request.headers.get("authorization") ?? "");
    return useCase().execute(match ? match[1] : null, input);
  });
}
