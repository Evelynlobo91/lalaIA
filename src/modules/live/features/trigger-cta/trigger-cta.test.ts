import { describe, expect, it, vi } from "vitest";
import { agendaOfDay, triggerWindowAt, type CtaRecord } from "../../domain/cta";
import type { StreamRecord } from "../../domain/stream";
import { pickActiveCta } from "../active-cta/active-cta.use-case";
import { StopCtaTrigger, TriggerCta, triggerCtaSchema } from "./trigger-cta.use-case";

const CTA = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const at = (time: string) => new Date(`2026-10-02T${time}:00-03:00`);
const actor = { id: "dona", isPartner: true, isAdmin: false };

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
  priority: 3,
  schedule: { kind: "absolute", startsAt: at("22:00"), endsAt: at("23:00") },
  triggeredAt: null,
  triggeredUntil: null,
  disabledAt: null,
  createdAt: at("10:00"),
  ...patch,
});

const stream = (patch: Partial<StreamRecord> = {}) => ({ id: "s1", ownerId: "dona", status: "live", ...patch }) as StreamRecord;

describe("triggerCtaSchema", () => {
  it("aceita só as durações oferecidas", () => {
    expect(triggerCtaSchema.parse({ ctaId: CTA, minutes: "10" })).toEqual({ ctaId: CTA, minutes: 10 });
    expect(triggerCtaSchema.safeParse({ ctaId: CTA, minutes: "60" }).success).toBe(false);
    expect(triggerCtaSchema.safeParse({ ctaId: "x", minutes: "5" }).success).toBe(false);
  });
});

describe("TriggerCta", () => {
  const deps = (opts: { cta?: CtaRecord | null; stream?: StreamRecord | null; entitled?: boolean } = {}) => {
    const setTrigger = vi.fn(async (_actor: string, _id: string, w: { at: Date; until: Date } | null) => cta({ triggeredAt: w?.at ?? null, triggeredUntil: w?.until ?? null }));
    const useCase = new TriggerCta(
      { find: vi.fn().mockResolvedValue(opts.cta === undefined ? cta() : opts.cta) },
      { findById: vi.fn().mockResolvedValue(opts.stream === undefined ? stream() : opts.stream) },
      { setTrigger },
      vi.fn().mockResolvedValue(opts.entitled ?? true),
      () => at("20:30"),
    );
    return { setTrigger, useCase };
  };

  it("solta a chamada agora, pelo tempo escolhido", async () => {
    const { setTrigger, useCase } = deps();
    const result = await useCase.execute(actor, CTA, 10);
    expect(result.ok && result.value.triggeredUntil).toEqual(at("20:40"));
    expect(setTrigger).toHaveBeenCalledWith("dona", CTA, { at: at("20:30"), until: at("20:40") });
  });

  it("recusa: chamada inexistente ou de outro, live fora do ar e plano sem o recurso", async () => {
    const code = async (d: ReturnType<typeof deps>) => {
      const r = await d.useCase.execute(actor, CTA, 5);
      expect(d.setTrigger).not.toHaveBeenCalled();
      return !r.ok && r.error.code;
    };
    expect(await code(deps({ cta: null }))).toBe("not_found");
    expect(await code(deps({ stream: stream({ ownerId: "outro" }) }))).toBe("not_found");
    expect(await code(deps({ stream: stream({ status: "paused" }) }))).toBe("stream_not_live");
    expect(await code(deps({ stream: stream({ status: "waiting" }) }))).toBe("stream_not_live");
    expect(await code(deps({ entitled: false }))).toBe("plan_feature_required");
  });
});

describe("StopCtaTrigger", () => {
  it("tira do ar a própria chamada; de outro → não encontrado", async () => {
    const setTrigger = vi.fn().mockResolvedValueOnce(cta()).mockResolvedValueOnce(null);
    expect((await new StopCtaTrigger({ setTrigger }).execute(actor, CTA)).ok).toBe(true);
    expect(setTrigger).toHaveBeenCalledWith("dona", CTA, null);
    const missing = await new StopCtaTrigger({ setTrigger }).execute(actor, CTA);
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});

describe("a chamada solta à mão no player e na agenda", () => {
  const liveSince = at("20:00");
  const solta = cta({ id: "solta", triggeredAt: at("20:30"), triggeredUntil: at("20:40") });
  const programada = cta({ id: "programada", priority: 1, schedule: { kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") } });

  it("vale só dentro da janela do disparo", () => {
    expect(triggerWindowAt(solta, at("20:29"))).toBeNull();
    expect(triggerWindowAt(solta, at("20:35"))).toEqual({ start: at("20:30"), end: at("20:40") });
    expect(triggerWindowAt(solta, at("20:40"))).toBeNull();
    expect(triggerWindowAt(cta(), at("20:35"))).toBeNull();
  });

  it("passa na frente das programadas, mesmo com prioridade menor; depois, a programada volta", () => {
    expect(pickActiveCta([programada, solta], at("20:35"), liveSince)).toMatchObject({ id: "solta", until: at("20:40").toISOString() });
    expect(pickActiveCta([programada, solta], at("20:41"), liveSince)?.id).toBe("programada");
  });

  it("duas soltas ao mesmo tempo: fica a solta por último", () => {
    const depois = cta({ id: "depois", triggeredAt: at("20:33"), triggeredUntil: at("20:38") });
    expect(pickActiveCta([solta, depois], at("20:35"), liveSince)?.id).toBe("depois");
    expect(pickActiveCta([solta, depois], at("20:39"), liveSince)?.id).toBe("solta");
  });

  it("entra na agenda de hoje enquanto está no ar", () => {
    // Além do horário programado (22h), a aparição solta à mão.
    expect(agendaOfDay([solta], at("20:35"), liveSince).timed.map((e) => [e.start, e.end])).toEqual([
      [at("20:30"), at("20:40")],
      [at("22:00"), at("23:00")],
    ]);
    expect(agendaOfDay([solta], at("20:45"), liveSince).timed.map((e) => e.start)).toEqual([at("22:00")]);
  });
});
