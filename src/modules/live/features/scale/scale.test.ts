import { describe, expect, it, vi } from "vitest";
import { scaleCheckRoute } from "./scale.route";
import { CheckScaleAlerts, GetLiveLoad, REQUESTS_PER_VIEWER_PER_SECOND, levelOf, monthStart, scaleLimitsFrom, type LiveLoad } from "./scale.use-case";

const now = new Date("2026-10-15T15:00:00Z");
const load = (opts: { viewers?: number; viewerMinutes?: number; max?: number; budget?: number } = {}) => {
  const month = vi.fn().mockResolvedValue({ viewerMinutes: opts.viewerMinutes ?? 0, peakViewers: 42 });
  const useCase = new GetLiveLoad({ now: async () => ({ liveStreams: 3, viewers: opts.viewers ?? 0 }), month }, () => ({ maxConcurrentViewers: opts.max ?? 0, monthlyViewerMinutesBudget: opts.budget ?? 0 }), () => now);
  return { month, useCase };
};

describe("limites e níveis de alerta (#56)", () => {
  it("lê os limites do ambiente; vazio, zero ou inválido = sem limite", () => {
    expect(scaleLimitsFrom({ LIVE_MAX_CONCURRENT_VIEWERS: "500", LIVE_MONTHLY_VIEWER_MINUTES_BUDGET: "100000" })).toEqual({ maxConcurrentViewers: 500, monthlyViewerMinutesBudget: 100000 });
    expect(scaleLimitsFrom({})).toEqual({ maxConcurrentViewers: 0, monthlyViewerMinutesBudget: 0 });
    expect(scaleLimitsFrom({ LIVE_MAX_CONCURRENT_VIEWERS: "muitos", LIVE_MONTHLY_VIEWER_MINUTES_BUDGET: "-5" })).toEqual({ maxConcurrentViewers: 0, monthlyViewerMinutesBudget: 0 });
  });

  it("atenção a partir de 80% do limite, crítico a partir de 100%; sem limite nunca alerta", () => {
    expect(levelOf(79, 100)).toBe("ok");
    expect(levelOf(80, 100)).toBe("warning");
    expect(levelOf(99, 100)).toBe("warning");
    expect(levelOf(100, 100)).toBe("critical");
    expect(levelOf(1_000_000, 0)).toBe("ok");
  });

  it("o mês começa à meia-noite do dia 1 em Joinville", () => {
    expect(monthStart(now)).toEqual(new Date("2026-10-01T03:00:00Z"));
    expect(monthStart(new Date("2026-10-01T02:59:00Z"))).toEqual(new Date("2026-09-01T03:00:00Z"));
  });

  it("cada espectador gera cerca de 0,68 requisição por segundo (status, chat e pulso)", () => {
    expect(REQUESTS_PER_VIEWER_PER_SECOND).toBeCloseTo(1 / 12 + 1 / 2.5 + 1 / 5, 5);
  });
});

describe("GetLiveLoad", () => {
  it("carga de agora e consumo do mês; sem limites configurados, sem alertas", async () => {
    const { month, useCase } = load({ viewers: 200, viewerMinutes: 12_345 });
    expect(await useCase.execute()).toEqual({
      liveStreams: 3,
      viewersNow: 200,
      requestsPerSecond: 136.7,
      peakViewersThisMonth: 42,
      viewerMinutesThisMonth: 12_345,
      limits: { maxConcurrentViewers: 0, monthlyViewerMinutesBudget: 0 },
      alerts: [],
    });
    expect(month).toHaveBeenCalledWith(new Date("2026-10-01T03:00:00Z"));
  });

  it("alerta de espectadores simultâneos e de orçamento mensal, cada um no seu nível", async () => {
    const result = await load({ viewers: 450, max: 500, viewerMinutes: 120_000, budget: 100_000 }).useCase.execute();
    expect(result.alerts.map((a) => [a.metric, a.level, a.value, a.limit])).toEqual([
      ["concurrent_viewers", "warning", 450, 500],
      ["monthly_viewer_minutes", "critical", 120_000, 100_000],
    ]);
    expect(result.alerts[0].message).toBe("450 espectadores simultâneos (limite configurado: 500).");
    expect((await load({ viewers: 100, max: 500, viewerMinutes: 10, budget: 100_000 }).useCase.execute()).alerts).toEqual([]);
  });
});

describe("CheckScaleAlerts (checagem agendada)", () => {
  const alerting: LiveLoad = {
    liveStreams: 1,
    viewersNow: 450,
    requestsPerSecond: 307.5,
    peakViewersThisMonth: 450,
    viewerMinutesThisMonth: 120_000,
    limits: { maxConcurrentViewers: 500, monthlyViewerMinutesBudget: 100_000 },
    alerts: [
      { metric: "concurrent_viewers", level: "warning", value: 450, limit: 500, message: "450 espectadores simultâneos (limite configurado: 500)." },
      { metric: "monthly_viewer_minutes", level: "critical", value: 120_000, limit: 100_000, message: "120.000 minutos de vídeo entregues neste mês (orçamento: 100.000)." },
    ],
  };

  it("registra cada alerta e manda o crítico para o monitoramento", async () => {
    const reporter = { warn: vi.fn(), capture: vi.fn() };
    expect(await new CheckScaleAlerts({ execute: async () => alerting }, reporter).execute()).toBe(alerting);
    expect(reporter.warn).toHaveBeenCalledTimes(2);
    expect(reporter.capture).toHaveBeenCalledTimes(1);
    expect(reporter.capture.mock.calls[0][0].message).toContain("120.000 minutos");
  });

  it("sem alertas, não registra nada", async () => {
    const reporter = { warn: vi.fn(), capture: vi.fn() };
    await new CheckScaleAlerts({ execute: async () => ({ ...alerting, alerts: [] }) }, reporter).execute();
    expect(reporter.warn).not.toHaveBeenCalled();
    expect(reporter.capture).not.toHaveBeenCalled();
  });

  it("rota: desligada sem o segredo, 401 com segredo errado, 200 com o certo", async () => {
    const SECRET = "s".repeat(32);
    const execute = vi.fn().mockResolvedValue(alerting);
    const call = (secret: string | undefined, auth?: string) =>
      scaleCheckRoute(() => ({ execute }) as unknown as CheckScaleAlerts, () => secret)(new Request("http://localhost/api/live/scale/check", { method: "POST", headers: auth ? { authorization: auth } : {} }));
    expect((await call(undefined, `Bearer ${SECRET}`)).status).toBe(503);
    expect((await call("curto", "Bearer curto")).status).toBe(503);
    expect((await call(SECRET)).status).toBe(401);
    expect((await call(SECRET, `Bearer ${"x".repeat(32)}`)).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    const ok = await call(SECRET, `Bearer ${SECRET}`);
    expect(ok.status).toBe(200);
    expect((await ok.json()).alerts).toHaveLength(2);
  });
});
