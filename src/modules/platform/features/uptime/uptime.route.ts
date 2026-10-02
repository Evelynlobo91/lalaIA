import type { CheckHealth } from "./uptime.use-case";
import { httpStatusFor } from "./uptime.schema";

const headers = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };

/** GET /api/health — 200 (ok/degraded) ou 503 (down). HEAD responde só o status, para monitores simples. */
export function healthRoutes(health: () => CheckHealth) {
  const GET = async () => {
    const report = await health().execute();
    return new Response(JSON.stringify(report), { status: httpStatusFor(report.status), headers });
  };
  const HEAD = async () => {
    const report = await health().execute();
    return new Response(null, { status: httpStatusFor(report.status), headers });
  };
  return { GET, HEAD };
}
