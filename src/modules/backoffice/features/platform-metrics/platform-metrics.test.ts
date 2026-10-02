import { describe, expect, it, vi } from "vitest";
import { GetPlatformMetrics, changeLabel, metricsFilterSchema, platformMetrics, type PlatformCounters } from "./platform-metrics.use-case";

const now = new Date("2026-10-02T12:00:00Z");
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Contadores que respondem pelo início do intervalo: período atual = `current`, anterior = `previous`. */
const counters = (current: number, previous: number, from: Date): PlatformCounters => {
  const counter = () => ({
    between: vi.fn(async (start: Date) => (start.getTime() === from.getTime() ? current : previous)),
    total: vi.fn(async () => 500),
  });
  return { users: counter(), partners: counter(), events: counter(), missions: counter(), lives: counter() };
};

describe("metricsFilterSchema", () => {
  it("aceita 7, 30 e 90 dias; o resto cai em 30", () => {
    expect(metricsFilterSchema.parse({ periodo: "7" }).periodo).toBe(7);
    expect(metricsFilterSchema.parse({ periodo: ["90", "7"] }).periodo).toBe(90);
    expect(metricsFilterSchema.parse({ periodo: "15" }).periodo).toBe(30);
    expect(metricsFilterSchema.parse({}).periodo).toBe(30);
  });
});

describe("GetPlatformMetrics", () => {
  it("só admin consulta; quem não é não dispara nenhuma contagem", async () => {
    const c = counters(1, 1, day("2026-09-02"));
    const result = await new GetPlatformMetrics(c, () => now).execute({ isAdmin: false }, {});
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(c.users.between).not.toHaveBeenCalled();
  });

  it("conta o período e o período anterior de mesma duração, encostados", async () => {
    const c = counters(12, 8, day("2026-09-25"));
    const result = await new GetPlatformMetrics(c, () => now).execute({ isAdmin: true }, { periodo: "7" });

    expect(c.events.between).toHaveBeenCalledWith(day("2026-09-25"), now);
    expect(c.events.between).toHaveBeenCalledWith(day("2026-09-18"), day("2026-09-25"));
    expect(result.ok && result.value).toMatchObject({ period: 7, from: day("2026-09-25"), to: now });
    expect(result.ok && result.value.metrics.map((m) => m.id)).toEqual(platformMetrics.map((m) => m.id));
    expect(result.ok && result.value.metrics.every((m) => m.current === 12 && m.previous === 8)).toBe(true);
  });

  it("só usuários e parceiros mostram total; as demais nem consultam", async () => {
    const c = counters(1, 1, day("2026-09-02"));
    const result = await new GetPlatformMetrics(c, () => now).execute({ isAdmin: true }, {});
    const byId = new Map(result.ok ? result.value.metrics.map((m) => [m.id, m]) : []);

    expect(byId.get("users")?.total).toEqual({ value: 500, label: "usuários no total" });
    expect(byId.get("partners")?.total).toEqual({ value: 500, label: "parceiros ativos hoje" });
    expect(byId.get("events")?.total).toBeNull();
    expect(c.events.total).not.toHaveBeenCalled();
  });
});

describe("changeLabel", () => {
  it("percentual quando há base anterior", () => {
    expect(changeLabel(10, 8)).toBe("+25%");
    expect(changeLabel(6, 8)).toBe("−25%");
    expect(changeLabel(4, 3)).toBe("+33,3%");
  });

  it("sem base anterior mostra a diferença absoluta", () => {
    expect(changeLabel(3, 0)).toBe("+3");
  });

  it("igual ao período anterior", () => {
    expect(changeLabel(5, 5)).toBe("sem mudança");
    expect(changeLabel(0, 0)).toBe("sem mudança");
  });
});
