import { describe, expect, it, vi } from "vitest";
import type { HealthCheck } from "../../domain/health";
import { AuthCheck } from "../../infra/health-checks";
import { healthRoutes } from "./uptime.route";
import { healthReportSchema, httpStatusFor } from "./uptime.schema";
import { CheckHealth } from "./uptime.use-case";

const check = (name: string, critical: boolean, run: HealthCheck["run"]): HealthCheck => ({ name, critical, run });
const ok = () => Promise.resolve();
const boom = () => Promise.reject(new Error("conexão recusada: senha=xyz"));
const never = (signal: AbortSignal) => new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(new Error("abortado"))));

function useCase(checks: HealthCheck[], timeoutMs = 50) {
  const log = { warn: vi.fn() };
  const uc = new CheckHealth(checks, log, "abc1234", () => 0, () => new Date("2026-10-10T12:00:00Z"), timeoutMs);
  return { uc, log };
}

describe("CheckHealth", () => {
  it("tudo saudável → ok, no formato público", async () => {
    const report = await useCase([check("banco", true, ok), check("autenticacao", false, ok)]).uc.execute();
    expect(report.status).toBe("ok");
    expect(healthReportSchema.parse(report)).toEqual(report);
    expect(httpStatusFor(report.status)).toBe(200);
  });

  it("não crítica falhou → degraded (200); crítica falhou → down (503)", async () => {
    expect((await useCase([check("banco", true, ok), check("autenticacao", false, boom)]).uc.execute()).status).toBe("degraded");
    const down = await useCase([check("banco", true, boom), check("autenticacao", false, ok)]).uc.execute();
    expect(down.status).toBe("down");
    expect(httpStatusFor(down.status)).toBe(503);
  });

  it("verificação lenta conta como falha e é abortada", async () => {
    let aborted = false;
    const slow = check("banco", true, (signal) => {
      signal.addEventListener("abort", () => (aborted = true));
      return never(signal);
    });
    const { uc, log } = useCase([slow], 20);
    expect((await uc.execute()).status).toBe("down");
    expect(aborted).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ check: "banco", error: expect.stringContaining("tempo esgotado") }));
  });

  it("o motivo da falha vai para o log, nunca para a resposta", async () => {
    const { uc, log } = useCase([check("banco", true, boom)]);
    const report = await uc.execute();
    expect(JSON.stringify(report)).not.toContain("senha");
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: expect.stringContaining("senha") }));
  });
});

describe("rota /api/health", () => {
  it("GET devolve o relatório sem cache; HEAD só o status", async () => {
    const { uc } = useCase([check("banco", true, boom)]);
    const routes = healthRoutes(() => uc);
    const get = await routes.GET();
    expect(get.status).toBe(503);
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect((await get.json()).status).toBe("down");
    const head = await routes.HEAD();
    expect(head.status).toBe(503);
    expect(await head.text()).toBe("");
  });
});

describe("AuthCheck", () => {
  it("chama o health do Supabase Auth com a chave pública e falha em status de erro", async () => {
    const fetchOk = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new AuthCheck("http://supabase.local/", "pub-key", fetchOk).run(new AbortController().signal);
    expect(fetchOk.mock.calls[0]![0]).toBe("http://supabase.local/auth/v1/health");
    expect(fetchOk.mock.calls[0]![1].headers).toEqual({ apikey: "pub-key" });
    const fetchFail = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(new AuthCheck("http://x", "k", fetchFail).run(new AbortController().signal)).rejects.toThrow(/503/);
  });
});
