import { timingSafeEqual } from "node:crypto";
import type { RenewSubscriptions } from "./subscribe.use-cases";

/** O que roda no ciclo diário: a renovação (#153) e, depois, a inadimplência (#154). */
export type DailyCycle = { renew: () => Pick<RenewSubscriptions, "execute">; overdue: () => { execute(): Promise<{ overdue: number; suspended: number }> } };

/** Comparação em tempo constante (não revela, pelo tempo de resposta, quanto do segredo bateu). */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rota do ciclo diário (#153, #154), chamada pelo agendador (ex.: Vercel Cron) com `Authorization: Bearer <CRON_SECRET>`.
 * Sem o segredo configurado (mínimo de 32 caracteres), a rota fica desligada: responde 503 e não roda nada.
 */
export function cycleRoute(cycle: DailyCycle, secret: () => string | undefined) {
  return async function POST(request: Request): Promise<Response> {
    const expected = secret();
    if (!expected || expected.length < 32) return Response.json({ error: { code: "not_configured" } }, { status: 503 });

    const header = request.headers.get("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!sameSecret(given, expected)) return Response.json({ error: { code: "unauthorized" } }, { status: 401 });

    // Primeiro emite as faturas do próximo ciclo; depois marca as vencidas e suspende quem passou da carência.
    const renewed = await cycle.renew().execute();
    const enforced = await cycle.overdue().execute();
    return Response.json({ ...renewed, ...enforced }, { headers: { "Cache-Control": "no-store" } });
  };
}
