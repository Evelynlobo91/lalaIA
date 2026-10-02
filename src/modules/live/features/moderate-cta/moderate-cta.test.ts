import { describe, expect, it, vi } from "vitest";
import { agendaOfDay, type CtaRecord } from "../../domain/cta";
import { pickActiveCta } from "../active-cta/active-cta.use-case";
import { GetCtaMetrics } from "../cta-metrics/cta-metrics.use-case";
import { ListCtasForModeration, ModerateCta, moderateCtaSchema } from "./moderate-cta.use-case";

const CTA = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const at = (time: string) => new Date(`2026-10-02T${time}:00-03:00`);

const cta = (patch: Partial<CtaRecord> = {}): CtaRecord => ({
  id: CTA,
  streamId: "s1",
  ownerId: "dona",
  type: "link",
  refId: null,
  href: "https://instagram.com/bar",
  external: true,
  title: "Siga o bar",
  body: null,
  buttonLabel: "Abrir",
  priority: 2,
  schedule: { kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") },
  triggeredAt: null,
  triggeredUntil: null,
  disabledAt: null,
  createdAt: at("10:00"),
  ...patch,
});

describe("ModerateCta (#182)", () => {
  const moderator = { id: "mod", canModerate: true };
  const deps = (updated: CtaRecord | null = cta({ disabledAt: at("20:10") })) => {
    const setDisabled = vi.fn().mockResolvedValue(updated);
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    return { setDisabled, events, useCase: new ModerateCta({ setDisabled }, events) };
  };

  it("desativa e publica o evento que alimenta a auditoria", async () => {
    const { setDisabled, events, useCase } = deps();
    expect((await useCase.execute(moderator, CTA, "disable")).ok).toBe(true);
    expect(setDisabled).toHaveBeenCalledWith("mod", CTA, true);
    expect(events.publish).toHaveBeenCalledWith("live.CtaDisabledByAdmin", { ctaId: CTA, streamId: "s1", disabledBy: "mod" });
  });

  it("reativa, com o evento próprio", async () => {
    const { setDisabled, events, useCase } = deps(cta());
    expect((await useCase.execute(moderator, CTA, "enable")).ok).toBe(true);
    expect(setDisabled).toHaveBeenCalledWith("mod", CTA, false);
    expect(events.publish).toHaveBeenCalledWith("live.CtaEnabledByAdmin", { ctaId: CTA, streamId: "s1", enabledBy: "mod" });
  });

  it("sem a capacidade de moderar: recusa sem tocar no banco; chamada inexistente → não encontrado, sem evento", async () => {
    const denied = deps();
    const r1 = await denied.useCase.execute({ id: "dona", canModerate: false }, CTA, "disable");
    expect(!r1.ok && r1.error.code).toBe("forbidden");
    expect(denied.setDisabled).not.toHaveBeenCalled();

    const missing = deps(null);
    const r2 = await missing.useCase.execute(moderator, CTA, "disable");
    expect(!r2.ok && r2.error.code).toBe("not_found");
    expect(missing.events.publish).not.toHaveBeenCalled();
  });

  it("lista para a moderação: só com a capacidade", async () => {
    const listAll = vi.fn().mockResolvedValue([]);
    expect((await new ListCtasForModeration({ listAll }).execute(moderator)).ok).toBe(true);
    expect(listAll).toHaveBeenCalledWith("mod", 50);
    expect((await new ListCtasForModeration({ listAll }).execute({ id: "dona", canModerate: false })).ok).toBe(false);
  });

  it("schema: só desativar ou reativar", () => {
    expect(moderateCtaSchema.safeParse({ ctaId: CTA, intent: "disable" }).success).toBe(true);
    expect(moderateCtaSchema.safeParse({ ctaId: CTA, intent: "delete" }).success).toBe(false);
  });
});

describe("chamada desativada", () => {
  it("não aparece no player nem na agenda, mesmo dentro da janela ou solta à mão", () => {
    const off = cta({ disabledAt: at("20:10"), triggeredAt: at("20:20"), triggeredUntil: at("20:40") });
    expect(pickActiveCta([off], at("20:30"), at("20:00"))).toBeNull();
    expect(pickActiveCta([off, cta({ id: "outra", priority: 3 })], at("20:30"), at("20:00"))?.id).toBe("outra");
    expect(agendaOfDay([off], at("20:30"), at("20:00")).timed).toEqual([]);
    expect(agendaOfDay([cta({ disabledAt: at("20:10"), schedule: { kind: "relative", offsetMinutes: 5, durationMinutes: 5 } })], at("19:00"), null).whenLive).toEqual([]);
  });
});

describe("GetCtaMetrics (#182)", () => {
  it("impressões e toques por chamada; quem não teve interação fica com zero", async () => {
    const totals = vi.fn().mockResolvedValue({ a: { cta_impression: 40, cta_click: 6 }, b: { cta_impression: 3 } });
    expect(await new GetCtaMetrics({ totals }).execute(["a", "b", "c"])).toEqual({
      a: { impressions: 40, clicks: 6 },
      b: { impressions: 3, clicks: 0 },
      c: { impressions: 0, clicks: 0 },
    });
    expect(totals).toHaveBeenCalledWith("cta", ["a", "b", "c"]);
  });

  it("sem chamadas não consulta; resposta fora do formato é recusada", async () => {
    const totals = vi.fn();
    expect(await new GetCtaMetrics({ totals }).execute([])).toEqual({});
    expect(totals).not.toHaveBeenCalled();
    await expect(new GetCtaMetrics({ totals: async () => ({ a: { cta_click: -1 } }) }).execute(["a"])).rejects.toThrow();
  });
});
