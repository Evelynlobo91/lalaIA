import { describe, expect, it, vi } from "vitest";
import { estimatedMinutesOf, isAvailable, xpSplit, type MissionDraft, type MissionPlaces, type MissionRecord, type MissionRepository } from "../../domain/mission";
import { missionSchema } from "./mission.schema";
import { ArchiveMission, SaveMission } from "./manage-missions.use-cases";

const CAFE = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const BAR = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const ALHEIO = "9a9b9c9d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const form = (patch: Record<string, string> = {}) => ({
  title: "Rota do Café",
  description: "Conheça os cafés do Centro de Joinville.",
  xp: "100",
  startsAt: "2026-10-10T08:00",
  endsAt: "2026-11-10T20:00",
  steps: JSON.stringify([
    { title: "Peça um espresso", placeId: CAFE },
    { title: "Prove o bolo da casa", placeId: BAR },
  ]),
  ...patch,
});

describe("missionSchema", () => {
  it("converte datas de Joinville e lê as etapas em ordem, com validação por QR", () => {
    const { draft } = missionSchema.parse(form());
    expect(draft.startsAt.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(draft.xp).toBe(100);
    expect(draft.steps).toEqual([
      { title: "Peça um espresso", placeId: CAFE, validation: "qr" },
      { title: "Prove o bolo da casa", placeId: BAR, validation: "qr" },
    ]);
  });

  it("tempo estimado e gasto por pessoa (#64): opcionais; gasto em reais vira centavos; surpresa pelo checkbox", () => {
    expect(missionSchema.parse(form()).draft).toMatchObject({ estimatedMinutes: null, costCents: null, surprise: false });
    expect(missionSchema.parse(form({ estimatedMinutes: "90", cost: "12,50", surprise: "on" })).draft).toMatchObject({ estimatedMinutes: 90, costCents: 1250, surprise: true });
    expect(missionSchema.parse(form({ cost: "0" })).draft.costCents).toBe(0);
    expect(estimatedMinutesOf({ estimatedMinutes: null, steps: [{}, {}, {}] as never })).toBe(90);
    expect(estimatedMinutesOf({ estimatedMinutes: 45, steps: [{}, {}, {}] as never })).toBe(45);
  });

  it("etapas com GPS (#61): raio e permanência; em QR + GPS a permanência é zero; QR ignora a geofence", () => {
    const { draft } = missionSchema.parse(
      form({
        steps: JSON.stringify([
          { title: "Chegue à praça", placeId: CAFE, validation: "gps", radiusMeters: 80, dwellMinutes: 5 },
          { title: "Peça um chope", placeId: BAR, validation: "qr_gps", radiusMeters: 50, dwellMinutes: 5 },
          { title: "Peça um café", placeId: CAFE, validation: "qr", radiusMeters: 999 },
          { title: "Volte à praça", placeId: CAFE, validation: "gps" },
        ]),
      }),
    );
    expect(draft.steps).toEqual([
      { title: "Chegue à praça", placeId: CAFE, validation: "gps", geofence: { radiusMeters: 80, dwellMinutes: 5 } },
      { title: "Peça um chope", placeId: BAR, validation: "qr_gps", geofence: { radiusMeters: 50, dwellMinutes: 0 } },
      { title: "Peça um café", placeId: CAFE, validation: "qr" },
      { title: "Volte à praça", placeId: CAFE, validation: "gps", geofence: { radiusMeters: 100, dwellMinutes: 2 } },
    ]);
  });

  it.each([
    ["fim antes do início", { endsAt: "2026-10-09T08:00" }, "endsAt", "O fim precisa ser depois do início."],
    ["XP fora da faixa", { xp: "5000" }, "xp", "O XP máximo é 1000."],
    ["sem etapas", { steps: "[]" }, "steps", "Adicione pelo menos uma etapa."],
    ["etapa sem lugar", { steps: JSON.stringify([{ title: "Peça um café", placeId: "" }]) }, "steps", "Etapa 1: escolha o lugar."],
    ["etapa sem descrição", { steps: JSON.stringify([{ title: "", placeId: CAFE }]) }, "steps", "Etapa 1: diga o que fazer (3 a 80 caracteres)."],
    ["etapas que não são JSON", { steps: "{" }, "steps", "Etapas inválidas."],
    ["mais de 10 etapas", { steps: JSON.stringify(Array.from({ length: 11 }, () => ({ title: "Etapa", placeId: CAFE }))) }, "steps", "Use no máximo 10 etapas."],
    ["tempo estimado fora da faixa", { estimatedMinutes: "5" }, "estimatedMinutes", "O tempo estimado vai de 10 a 600 minutos."],
    ["gasto inválido", { cost: "abc" }, "cost", "Informe o gasto por pessoa em reais (de 0 a 1000)."],
    ["raio do GPS fora da faixa", { steps: JSON.stringify([{ title: "Chegue à praça", placeId: CAFE, validation: "gps", radiusMeters: 1000, dwellMinutes: 2 }]) }, "steps", "Etapa 1: o raio do check-in vai de 30 a 300 m."],
    ["permanência fora da faixa", { steps: JSON.stringify([{ title: "Chegue à praça", placeId: CAFE, validation: "gps", radiusMeters: 80, dwellMinutes: 90 }]) }, "steps", "Etapa 1: o tempo no lugar vai de 0 a 30 minutos."],
  ])("recusa %s", (_, patch, field, message) => {
    const res = missionSchema.safeParse(form(patch));
    expect(res.success).toBe(false);
    expect(res.error?.issues.find((i) => i.path[0] === field)?.message).toBe(message);
  });
});

describe("xpSplit / isAvailable", () => {
  it.each([
    [100, 3, 25, 25],
    [100, 2, 33, 34],
    [10, 9, 1, 1],
    [50, 1, 25, 25],
  ])("%d XP em %d etapas → %d por etapa + %d de bônus (soma = total)", (total, n, perStep, bonus) => {
    expect(xpSplit(total, n)).toEqual({ perStep, completionBonus: bonus });
    expect(perStep * n + bonus).toBe(total);
  });

  it("disponível só se ativa e dentro da janela", () => {
    const m = { status: "active" as const, startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-31T00:00:00Z") };
    expect(isAvailable(m, new Date("2026-10-15T00:00:00Z"))).toBe(true);
    expect(isAvailable(m, new Date("2026-09-30T00:00:00Z"))).toBe(false);
    expect(isAvailable(m, new Date("2026-10-31T00:00:00Z"))).toBe(false);
    expect(isAvailable({ ...m, status: "archived" }, new Date("2026-10-15T00:00:00Z"))).toBe(false);
  });
});

describe("SaveMission / ArchiveMission", () => {
  const now = () => new Date("2026-10-01T12:00:00Z");
  const draft: MissionDraft = missionSchema.parse(form()).draft;
  const record = (patch: Partial<MissionRecord> = {}): MissionRecord => ({
    ...draft,
    id: "m1",
    ownerId: "dono",
    status: "active",
    createdAt: now(),
    steps: draft.steps.map((s, i) => ({ ...s, id: `s${i + 1}`, missionId: "m1", position: i + 1 })),
    ...patch,
  });
  const repo = (patch: Partial<MissionRepository> = {}): MissionRepository => ({
    findById: vi.fn().mockResolvedValue(record()),
    listByOwner: vi.fn(),
    listAvailable: vi.fn(),
    listAvailableSurprises: vi.fn(),
    findByIds: vi.fn(),
    findByStepId: vi.fn(),
    create: vi.fn().mockResolvedValue(record()),
    update: vi.fn().mockResolvedValue(record()),
    archive: vi.fn().mockResolvedValue(record({ status: "archived" })),
    ...patch,
  });
  const place = (id: string) => ({ id, name: id, neighborhood: null });
  const places = (managed = [CAFE, BAR]): MissionPlaces => ({
    summaries: vi.fn(async (ids: string[]) => ids.filter((id) => [CAFE, BAR, ALHEIO].includes(id)).map(place)),
    managedBy: vi.fn().mockResolvedValue(managed.map(place)),
  });
  const free = { hasParticipants: vi.fn().mockResolvedValue(false) };
  const locked = { hasParticipants: vi.fn().mockResolvedValue(true) };
  const parceiro = { id: "dono", isPartner: true, isAdmin: false };
  const admin = { id: "admin", isPartner: false, isAdmin: true };

  it("parceiro cria missão com etapas nos lugares que administra", async () => {
    const missions = repo();
    const res = await new SaveMission(missions, places(), free, now).execute(parceiro, undefined, draft);
    expect(res.ok).toBe(true);
    expect(missions.create).toHaveBeenCalledWith("dono", draft);
  });

  it("parceiro não cria etapa em lugar que não administra", async () => {
    const missions = repo();
    const res = await new SaveMission(missions, places([CAFE]), free, now).execute(parceiro, undefined, draft);
    expect(!res.ok && res.error.details).toEqual([{ path: ["steps"], message: "Etapa 2: escolha um lugar que você administra." }]);
    expect(missions.create).not.toHaveBeenCalled();
  });

  it("admin cria em qualquer lugar existente (não consulta lugares administrados)", async () => {
    const p = places([]);
    const withForeign = { ...draft, steps: [{ title: "Visite", placeId: ALHEIO, validation: "qr" as const }] };
    expect((await new SaveMission(repo(), p, free, now).execute(admin, undefined, withForeign)).ok).toBe(true);
    expect(p.managedBy).not.toHaveBeenCalled();
  });

  it("lugar inexistente é recusado na etapa certa", async () => {
    const ghost = { ...draft, steps: [draft.steps[0], { title: "Visite", placeId: "00000000-0000-4000-8000-000000000000", validation: "qr" as const }] };
    const res = await new SaveMission(repo(), places(), free, now).execute(admin, undefined, ghost);
    expect(!res.ok && res.error.details).toEqual([{ path: ["steps"], message: "Etapa 2: lugar não encontrado." }]);
  });

  it("usuário comum não cria missão", async () => {
    const res = await new SaveMission(repo(), places(), free, now).execute({ id: "x", isPartner: false, isAdmin: false }, undefined, draft);
    expect(!res.ok && res.error.code).toBe("forbidden");
  });

  it("não cria missão que já terminou", async () => {
    const late = () => new Date("2026-12-01T00:00:00Z");
    const res = await new SaveMission(repo(), places(), free, late).execute(parceiro, undefined, draft);
    expect(!res.ok && res.error.details).toEqual([{ path: ["endsAt"], message: "O fim da missão precisa estar no futuro." }]);
  });

  it.each([
    ["de outra pessoa", record({ ownerId: "outro" }), "forbidden"],
    ["encerrada", record({ status: "archived" }), "mission_archived"],
  ])("não edita missão %s", async (_, current, code) => {
    const missions = repo({ findById: vi.fn().mockResolvedValue(current) });
    const res = await new SaveMission(missions, places(), free, now).execute(parceiro, "m1", draft);
    expect(!res.ok && res.error.code).toBe(code);
    expect(missions.update).not.toHaveBeenCalled();
  });

  it("edita etapas enquanto ninguém aceitou", async () => {
    const missions = repo();
    expect((await new SaveMission(missions, places(), free, now).execute(parceiro, "m1", { ...draft, xp: 200 })).ok).toBe(true);
    expect(missions.update).toHaveBeenCalledWith("dono", "m1", { ...draft, xp: 200 }, { saveSteps: true });
  });

  it("depois do primeiro aceite, etapas e XP travam; título e janela ainda mudam", async () => {
    const missions = repo();
    const save = new SaveMission(missions, places(), locked, now);
    const xp = await save.execute(parceiro, "m1", { ...draft, xp: 200 });
    expect(!xp.ok && xp.error.code).toBe("mission_locked");
    const steps = await save.execute(parceiro, "m1", { ...draft, steps: [draft.steps[1], draft.steps[0]] });
    expect(!steps.ok && steps.error.code).toBe("mission_locked");
    // Trocar QR por GPS (ou mexer no raio) também muda a etapa que quem aceitou viu.
    const gps = await save.execute(parceiro, "m1", { ...draft, steps: [{ ...draft.steps[0], validation: "gps", geofence: { radiusMeters: 300, dwellMinutes: 0 } }, draft.steps[1]] });
    expect(!gps.ok && gps.error.code).toBe("mission_locked");
    expect(missions.update).not.toHaveBeenCalled();

    expect((await save.execute(parceiro, "m1", { ...draft, title: "Rota do Café II" })).ok).toBe(true);
    expect(missions.update).toHaveBeenCalledWith("dono", "m1", { ...draft, title: "Rota do Café II" }, { saveSteps: false });
  });

  it("encerrar: só o dono (ou admin); é idempotente", async () => {
    expect((await new ArchiveMission(repo()).execute(parceiro, "m1")).ok).toBe(true);
    const outro = await new ArchiveMission(repo()).execute({ id: "outro", isPartner: true, isAdmin: false }, "m1");
    expect(!outro.ok && outro.error.code).toBe("forbidden");
    const already = repo({ findById: vi.fn().mockResolvedValue(record({ status: "archived" })) });
    expect((await new ArchiveMission(already).execute(admin, "m1")).ok).toBe(true);
    expect(already.archive).not.toHaveBeenCalled();
  });
});
