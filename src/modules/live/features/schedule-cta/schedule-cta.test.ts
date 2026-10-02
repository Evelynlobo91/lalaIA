import { describe, expect, it, vi } from "vitest";
import { agendaOfDay, allowedLink, ctaLinkDomainsFrom, describeSchedule, windowAt, windowsBetween, type CtaRecord, type CtaSchedule } from "../../domain/cta";
import type { StreamRecord } from "../../domain/stream";
import { ctaTypeHandlers, type CtaCatalog } from "./cta-types";
import { ctaSchema, type CtaDraft } from "./schedule-cta.schema";
import { DeleteCta, GetCtaPanel, SaveCta } from "./schedule-cta.use-case";

const STREAM = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const OFFER = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const at = (time: string) => new Date(`2026-10-02T${time}:00-03:00`);
const liveSince = at("20:00");

const stream = (patch: Partial<StreamRecord> = {}): StreamRecord => ({
  id: STREAM,
  ownerId: "dona",
  entityType: "place",
  entityId: "lugar",
  provider: "fake",
  providerStreamId: "p",
  playbackId: "pb",
  control: "on",
  signal: "live",
  status: "live",
  signalChangedAt: liveSince,
  createdAt: at("10:00"),
  note: null,
  ...patch,
});

const cta = (patch: Partial<CtaRecord> = {}): CtaRecord => ({
  id: "c1",
  streamId: STREAM,
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

const catalog = (): CtaCatalog => ({
  offers: vi.fn().mockResolvedValue([{ id: OFFER, label: "Chope em dobro · Bar", href: "/lugares/lugar" }]),
  missions: vi.fn().mockResolvedValue([{ id: "m1", label: "Rota dos bares" }]),
  events: vi.fn().mockResolvedValue([{ id: "e1", label: "Samba · Bar" }]),
  directions: vi.fn().mockResolvedValue("https://www.google.com/maps/dir/?api=1&destination=-26.300000,-48.840000"),
});

const draft = (patch: Partial<CtaDraft> = {}): CtaDraft => ({
  type: "promocao",
  refId: OFFER,
  url: null,
  title: "Chope em dobro até 21h",
  body: null,
  buttonLabel: "Ver oferta",
  priority: 1,
  schedule: { kind: "relative", offsetMinutes: 15, durationMinutes: 10 },
  ...patch,
});

describe("janelas do agendamento", () => {
  it("absoluto: vale entre o início e o fim, com ou sem a live no ar", () => {
    const s: CtaSchedule = { kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") };
    expect(windowAt(s, at("19:59"), null)).toBeNull();
    expect(windowAt(s, at("20:00"), null)).toEqual({ start: at("20:00"), end: at("21:00") });
    expect(windowAt(s, at("20:59"), liveSince)).not.toBeNull();
    expect(windowAt(s, at("21:00"), liveSince)).toBeNull();
  });

  it("relativo: conta a partir de quando a live entrou no ar; sem a live, não há janela", () => {
    const s: CtaSchedule = { kind: "relative", offsetMinutes: 15, durationMinutes: 10 };
    expect(windowAt(s, at("20:20"), null)).toBeNull();
    expect(windowAt(s, at("20:14"), liveSince)).toBeNull();
    expect(windowAt(s, at("20:15"), liveSince)).toEqual({ start: at("20:15"), end: at("20:25") });
    expect(windowAt(s, at("20:25"), liveSince)).toBeNull();
  });

  it("recorrente: a cada intervalo, a partir do primeiro (a live não abre com o CTA na tela)", () => {
    const s: CtaSchedule = { kind: "recurring", intervalMinutes: 30, durationMinutes: 5 };
    expect(windowAt(s, at("20:02"), liveSince)).toBeNull();
    expect(windowAt(s, at("20:31"), liveSince)).toEqual({ start: at("20:30"), end: at("20:35") });
    expect(windowAt(s, at("20:35"), liveSince)).toBeNull();
    expect(windowAt(s, at("21:04"), liveSince)).toEqual({ start: at("21:00"), end: at("21:05") });
    expect(windowsBetween(s, at("20:00"), at("22:00"), liveSince).map((w) => w.start)).toEqual([at("20:30"), at("21:00"), at("21:30")]);
  });

  it("descreve o agendamento em português", () => {
    expect(describeSchedule({ kind: "relative", offsetMinutes: 15, durationMinutes: 10 })).toBe("15 min depois de entrar ao vivo, por 10 min");
    expect(describeSchedule({ kind: "relative", offsetMinutes: 0, durationMinutes: 10 })).toBe("Assim que entrar ao vivo, por 10 min");
    expect(describeSchedule({ kind: "recurring", intervalMinutes: 30, durationMinutes: 5 })).toBe("A cada 30 min, por 5 min");
    expect(describeSchedule({ kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") })).toMatch(/20:00 até 21:00$/);
  });
});

describe("agendaOfDay", () => {
  const ctas = [
    cta({ id: "abs", title: "Happy hour" }),
    cta({ id: "rel", title: "Missão da casa", schedule: { kind: "relative", offsetMinutes: 15, durationMinutes: 10 } }),
    cta({ id: "amanha", title: "Amanhã", schedule: { kind: "absolute", startsAt: new Date("2026-10-03T20:00:00-03:00"), endsAt: new Date("2026-10-03T21:00:00-03:00") } }),
  ];

  it("sem a live no ar: mostra os horários marcados de hoje e deixa os relativos para 'quando entrar no ar'", () => {
    const agenda = agendaOfDay(ctas, at("18:00"), null);
    expect(agenda.timed.map((e) => e.ctaId)).toEqual(["abs"]);
    expect(agenda.whenLive.map((c) => c.id)).toEqual(["rel"]);
  });

  it("com a live no ar: os relativos ganham horário e entram em ordem", () => {
    const agenda = agendaOfDay(ctas, at("20:05"), liveSince);
    expect(agenda.timed.map((e) => [e.ctaId, e.start])).toEqual([
      ["abs", at("20:00")],
      ["rel", at("20:15")],
    ]);
    expect(agenda.whenLive).toEqual([]);
  });
});

describe("link permitido", () => {
  const domains = ["instagram.com", "wa.me"];

  it("aceita https do domínio ou de um subdomínio", () => {
    expect(allowedLink(" https://instagram.com/bar ", domains)).toBe("https://instagram.com/bar");
    expect(allowedLink("https://www.instagram.com/bar", domains)).toBe("https://www.instagram.com/bar");
  });

  it("recusa http, outro domínio, domínio parecido, credenciais e texto solto", () => {
    for (const bad of ["http://instagram.com/bar", "https://exemplo.com", "https://instagram.com.evil.io", "https://evilinstagram.com", "https://u:p@instagram.com", "javascript:alert(1)", "instagram.com/bar"]) {
      expect(allowedLink(bad, domains)).toBeNull();
    }
  });

  it("lista de domínios vem do ambiente; vazia ou inválida cai no padrão", () => {
    expect(ctaLinkDomainsFrom(" Reservas.Bar.com , x ")).toEqual(["reservas.bar.com"]);
    expect(ctaLinkDomainsFrom(undefined)).toContain("instagram.com");
  });
});

describe("ctaSchema", () => {
  const base = { streamId: STREAM, type: "link", url: "https://instagram.com/bar", title: "Siga o bar", buttonLabel: "Abrir", priority: "2" };

  it("lê cada agendamento do formulário", () => {
    const absolute = ctaSchema.parse({ ...base, scheduleKind: "absolute", startsAt: "2026-10-02T20:00", endsAt: "2026-10-02T21:00" });
    expect(absolute.draft.schedule).toEqual({ kind: "absolute", startsAt: at("20:00"), endsAt: at("21:00") });
    expect(ctaSchema.parse({ ...base, scheduleKind: "relative", offsetMinutes: "15", durationMinutes: "10" }).draft.schedule).toEqual({ kind: "relative", offsetMinutes: 15, durationMinutes: 10 });
    expect(ctaSchema.parse({ ...base, scheduleKind: "recurring", intervalMinutes: "30", durationMinutes: "5" }).draft).toMatchObject({
      url: "https://instagram.com/bar",
      refId: null,
      body: null,
      priority: 2,
      schedule: { kind: "recurring", intervalMinutes: 30, durationMinutes: 5 },
    });
  });

  it("aponta o campo errado em cada agendamento", () => {
    const fields = (input: Record<string, string>) => {
      const parsed = ctaSchema.safeParse({ ...base, ...input });
      return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
    };
    expect(fields({ scheduleKind: "absolute", startsAt: "2026-10-02T21:00", endsAt: "2026-10-02T20:00" })).toEqual(["endsAt"]);
    expect(fields({ scheduleKind: "absolute", startsAt: "2026-10-02T20:00", endsAt: "2026-10-04T20:00" })).toEqual(["endsAt"]);
    expect(fields({ scheduleKind: "absolute", startsAt: "", endsAt: "" })).toEqual(["startsAt", "endsAt"]);
    expect(fields({ scheduleKind: "relative", offsetMinutes: "abc", durationMinutes: "0" })).toEqual(["durationMinutes", "offsetMinutes"]);
    expect(fields({ scheduleKind: "recurring", intervalMinutes: "10", durationMinutes: "10" })).toEqual(["durationMinutes"]);
    expect(fields({ scheduleKind: "recurring", intervalMinutes: "2", durationMinutes: "1" })).toEqual(["intervalMinutes"]);
    expect(fields({ scheduleKind: "relative", offsetMinutes: "5", durationMinutes: "5", title: "ab" })).toEqual(["title"]);
    expect(fields({ scheduleKind: "relative", offsetMinutes: "5", durationMinutes: "5", refId: "x" })).toEqual(["refId"]);
  });
});

describe("tipos de CTA (estratégias)", () => {
  const handlers = ctaTypeHandlers(catalog(), ["instagram.com"]);
  const target = { entityType: "place" as const, entityId: "lugar" };

  it("promoção, missão e evento: só o que é do parceiro, com o destino de cada tipo", async () => {
    expect(await handlers.promocao.resolve("dona", target, { refId: OFFER, url: null })).toEqual({ ok: true, value: { refId: OFFER, href: "/lugares/lugar", external: false } });
    expect(await handlers.missao.resolve("dona", target, { refId: "m1", url: null })).toMatchObject({ value: { href: "/missoes/m1", external: false } });
    expect(await handlers.evento.resolve("dona", target, { refId: "e1", url: null })).toMatchObject({ value: { href: "/eventos/e1" } });
    for (const type of ["promocao", "missao", "evento"] as const) {
      const other = await handlers[type].resolve("dona", target, { refId: "de-outro", url: null });
      expect(!other.ok && other.error.code).toBe("validation_failed");
      expect((await handlers[type].resolve("dona", target, { refId: null, url: null })).ok).toBe(false);
    }
  });

  it("quero ir: rota até o lugar; sem coordenadas, recusa", async () => {
    expect(await handlers["quero-ir"].resolve("dona", target, { refId: null, url: null })).toMatchObject({ value: { refId: null, external: true, href: expect.stringContaining("google.com/maps/dir") } });
    const noMap = ctaTypeHandlers({ ...catalog(), directions: async () => null }, []);
    expect((await noMap["quero-ir"].resolve("dona", target, { refId: null, url: null })).ok).toBe(false);
  });

  it("link: só domínio permitido", async () => {
    expect(await handlers.link.resolve("dona", target, { refId: null, url: "https://instagram.com/bar" })).toMatchObject({ value: { href: "https://instagram.com/bar", external: true } });
    expect((await handlers.link.resolve("dona", target, { refId: null, url: "https://exemplo.com" })).ok).toBe(false);
    expect((await handlers.link.resolve("dona", target, { refId: null, url: null })).ok).toBe(false);
  });

  it("cada tipo diz o campo que pede e o texto padrão do botão", async () => {
    expect(Object.values(handlers).map((h) => [h.type, h.field, h.defaultButton])).toEqual([
      ["promocao", "ref", "Ver oferta"],
      ["missao", "ref", "Aceitar missão"],
      ["evento", "ref", "Ver evento"],
      ["quero-ir", "none", "Quero ir"],
      ["link", "url", "Abrir"],
    ]);
    expect(await handlers.promocao.options("dona")).toEqual([{ id: OFFER, label: "Chope em dobro · Bar" }]);
  });
});

describe("SaveCta", () => {
  const actor = { id: "dona", isPartner: true, isAdmin: false };
  const deps = (opts: { stream?: StreamRecord | null; existing?: CtaRecord[]; entitled?: boolean } = {}) => {
    const streams = { findById: vi.fn().mockResolvedValue(opts.stream === undefined ? stream() : opts.stream) };
    const ctas = {
      listByStream: vi.fn().mockResolvedValue(opts.existing ?? []),
      create: vi.fn(async (_actor: string, c) => cta({ ...c, id: "novo" })),
      update: vi.fn(async (_actor: string, id: string, c) => cta({ ...c, id })),
    };
    const entitled = vi.fn().mockResolvedValue(opts.entitled ?? true);
    return { streams, ctas, entitled, useCase: new SaveCta(streams, ctas, ctaTypeHandlers(catalog(), ["instagram.com"]), entitled) };
  };

  it("cria o CTA com o destino resolvido pelo tipo", async () => {
    const { ctas, useCase } = deps();
    const result = await useCase.execute(actor, STREAM, undefined, draft());
    expect(result.ok).toBe(true);
    expect(ctas.create).toHaveBeenCalledWith("dona", expect.objectContaining({ streamId: STREAM, type: "promocao", refId: OFFER, href: "/lugares/lugar", external: false, title: "Chope em dobro até 21h" }));
    expect(ctas.create.mock.calls[0][1]).not.toHaveProperty("url");
  });

  it("edita um CTA da própria transmissão; de outra (ou inexistente) → não encontrado", async () => {
    const mine = deps({ existing: [cta({ id: "c1" })] });
    expect((await mine.useCase.execute(actor, STREAM, "c1", draft())).ok).toBe(true);
    expect(mine.ctas.update).toHaveBeenCalledWith("dona", "c1", expect.objectContaining({ href: "/lugares/lugar" }));

    const other = deps();
    const result = await other.useCase.execute(actor, STREAM, "c9", draft());
    expect(!result.ok && result.error.code).toBe("not_found");
    expect(other.ctas.update).not.toHaveBeenCalled();
  });

  it("recusa: transmissão de outro dono, encerrada, sem o recurso no plano, limite e referência alheia", async () => {
    const code = async (d: ReturnType<typeof deps>, input = draft()) => {
      const r = await d.useCase.execute(actor, STREAM, undefined, input);
      expect(d.ctas.create).not.toHaveBeenCalled();
      return !r.ok && r.error.code;
    };
    expect(await code(deps({ stream: null }))).toBe("not_found");
    expect(await code(deps({ stream: stream({ ownerId: "outro" }) }))).toBe("forbidden");
    expect(await code(deps({ stream: stream({ status: "ended" }) }))).toBe("stream_ended");
    expect(await code(deps({ entitled: false }))).toBe("plan_feature_required");
    expect(await code(deps({ existing: Array.from({ length: 20 }, (_, i) => cta({ id: `c${i}` })) }))).toBe("too_many_ctas");
    expect(await code(deps(), draft({ refId: "de-outro" }))).toBe("validation_failed");
  });

  it("admin não programa na transmissão de um parceiro", async () => {
    const d = deps({ stream: stream({ ownerId: "outro" }) });
    const result = await d.useCase.execute({ id: "admin", isPartner: false, isAdmin: true }, STREAM, undefined, draft());
    expect(!result.ok && result.error.code).toBe("forbidden");
  });
});

describe("DeleteCta / GetCtaPanel", () => {
  const actor = { id: "dona", isPartner: true, isAdmin: false };

  it("remove o próprio CTA; inexistente ou de outro → não encontrado", async () => {
    const remove = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await new DeleteCta({ remove }).execute(actor, "c1")).ok).toBe(true);
    const missing = await new DeleteCta({ remove }).execute(actor, "c1");
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });

  it("painel: CTAs, agenda do dia (com a live no ar) e opções de cada tipo; transmissão alheia → null", async () => {
    const list = [cta({ id: "rel", schedule: { kind: "relative", offsetMinutes: 15, durationMinutes: 10 } })];
    const panelOf = (s: StreamRecord | null) =>
      new GetCtaPanel({ findById: async () => s }, { listByStream: async () => list }, ctaTypeHandlers(catalog(), ["instagram.com"]), async () => true, () => at("20:05")).execute(actor, STREAM);

    const panel = await panelOf(stream());
    expect(panel?.agenda.timed.map((e) => e.start)).toEqual([at("20:15")]);
    expect(panel?.options.promocao).toEqual({ field: "ref", defaultButton: "Ver oferta", options: [{ id: OFFER, label: "Chope em dobro · Bar" }] });
    expect(panel?.entitled).toBe(true);

    const waiting = await panelOf(stream({ status: "waiting", signal: "offline" }));
    expect(waiting?.agenda).toMatchObject({ timed: [], whenLive: [{ id: "rel" }] });
    expect(await panelOf(stream({ ownerId: "outro" }))).toBeNull();
    expect(await panelOf(null)).toBeNull();
  });
});
