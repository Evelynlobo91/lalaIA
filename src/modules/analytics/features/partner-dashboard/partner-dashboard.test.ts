import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/kernel";
import type { DailyMetric } from "../../domain/daily-metrics";
import { GetDailyMetrics } from "../aggregations/aggregations.use-case";
import { partnerDashboardSchema } from "./partner-dashboard.schema";
import { PartnerDashboard, type PartnerResource } from "./partner-dashboard.use-case";

const PLACE = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const MISSION = "33333333-3333-4333-8333-333333333333";
const STREAM = "44444444-4444-4444-8444-444444444444";
// 2026-10-10 15:00 em Joinville.
const now = new Date("2026-10-10T18:00:00Z");

const resources: PartnerResource[] = [
  { type: "place", id: PLACE, name: "Bar do Zé", liveStreamIds: [STREAM] },
  { type: "event", id: EVENT, name: "Show de sábado", liveStreamIds: [] },
  { type: "mission", id: MISSION, name: "Rota do chopp", liveStreamIds: [] },
];

const m = (day: string, entityType: DailyMetric["entityType"], entityId: string, kind: DailyMetric["kind"], total: number): DailyMetric => ({ day, entityType, entityId, kind, total });

function setup(rows: DailyMetric[]) {
  const execute = vi.fn().mockResolvedValue(ok(rows));
  const useCase = new PartnerDashboard({ resourcesOf: vi.fn().mockResolvedValue(resources) }, { execute }, () => now);
  return { useCase, execute };
}

describe("PartnerDashboard", () => {
  it("consulta só as entidades do parceiro (inclusive as lives) no período + período anterior", async () => {
    const { useCase, execute } = setup([]);
    await useCase.execute("dono", partnerDashboardSchema.parse({ periodo: "7" }));
    expect(execute).toHaveBeenCalledWith({
      refs: { place: [PLACE], event: [EVENT], mission: [MISSION], live: [STREAM] },
      from: "2026-09-27",
      to: "2026-10-10",
    });
  });

  it("6 métricas com série diária, comparação e conversão; detalhamento por recurso", async () => {
    const { useCase } = setup([
      m("2026-10-01", "place", PLACE, "view", 10), // período anterior
      m("2026-10-01", "place", PLACE, "quero_ir", 1),
      m("2026-10-04", "place", PLACE, "view", 30),
      m("2026-10-04", "event", EVENT, "view", 10),
      m("2026-10-04", "place", PLACE, "favorite", 4),
      m("2026-10-10", "place", PLACE, "quero_ir", 6),
      m("2026-10-10", "mission", MISSION, "checkin", 2),
      m("2026-10-10", "live", STREAM, "live_view", 7),
    ]);
    const result = await useCase.execute("dono", partnerDashboardSchema.parse({ periodo: "7" }));
    if (!result.ok) throw new Error("esperava ok");
    const v = result.value;

    expect([v.from, v.to]).toEqual(["2026-10-04", "2026-10-10"]);
    const byId = Object.fromEntries(v.metrics.map((x) => [x.id, x]));
    expect(Object.keys(byId)).toEqual(["views", "favorites", "queroIr", "liveViews", "checkins", "conversion"]);
    expect(byId.views).toMatchObject({ total: 40, previousTotal: 10 });
    expect(byId.views!.series).toHaveLength(7);
    expect(byId.views!.series[0]).toEqual({ day: "2026-10-04", value: 40 });
    expect(byId.liveViews!.total).toBe(7);
    expect(byId.conversion).toMatchObject({ total: 20, previousTotal: 10, unit: "percent" }); // (6+2)/40, 1/10

    const place = v.breakdown.find((r) => r.key === `place:${PLACE}`)!;
    expect(place.totals).toEqual({ views: 30, favorites: 4, queroIr: 6, liveViews: 7, checkins: 0 });
    expect(v.breakdown[0]!.key).toBe(`place:${PLACE}`); // mais visualizado primeiro
  });

  it("filtro por recurso restringe a consulta; recurso de outro parceiro → 404", async () => {
    const { useCase, execute } = setup([]);
    const one = await useCase.execute("dono", partnerDashboardSchema.parse({ recurso: `event:${EVENT}` }));
    expect(one.ok).toBe(true);
    expect(execute.mock.calls[0]![0].refs).toEqual({ place: [], event: [EVENT], mission: [], live: [] });

    const alheio = await useCase.execute("dono", partnerDashboardSchema.parse({ recurso: "place:99999999-9999-4999-8999-999999999999" }));
    expect(alheio).toMatchObject({ ok: false, error: { name: "NotFoundError" } });
  });

  it("schema: período e recurso inválidos são recusados", () => {
    expect(partnerDashboardSchema.safeParse({ periodo: "365" }).success).toBe(false);
    expect(partnerDashboardSchema.safeParse({ recurso: "live:x" }).success).toBe(false);
    expect(partnerDashboardSchema.parse({}).periodo).toBe(30);
  });
});

describe("GetDailyMetrics", () => {
  const reader = { daily: vi.fn().mockResolvedValue([]) };

  it("sem entidades não consulta; repassa o 'hoje' de Joinville", async () => {
    const useCase = new GetDailyMetrics(reader, () => new Date("2026-10-11T02:00:00Z")); // 23h do dia 10 em Joinville
    expect(await useCase.execute({ refs: {}, from: "2026-10-01", to: "2026-10-10" })).toEqual(ok([]));
    expect(reader.daily).not.toHaveBeenCalled();
    await useCase.execute({ refs: { place: [PLACE] }, from: "2026-10-01", to: "2026-10-10" });
    expect(reader.daily).toHaveBeenCalledWith({ refs: { place: [PLACE] }, from: "2026-10-01", to: "2026-10-10", today: "2026-10-10" });
  });

  it("período invertido, longo demais ou id inválido → ValidationError", async () => {
    const useCase = new GetDailyMetrics(reader);
    for (const input of [
      { refs: { place: [PLACE] }, from: "2026-10-10", to: "2026-10-01" },
      { refs: { place: [PLACE] }, from: "2025-01-01", to: "2026-10-01" },
      { refs: { place: ["x"] }, from: "2026-10-01", to: "2026-10-02" },
    ]) {
      expect(await useCase.execute(input)).toMatchObject({ ok: false, error: { name: "ValidationError" } });
    }
  });
});
