import { describe, expect, it, vi } from "vitest";
import type { MissionRecord } from "../../domain/mission";
import { offerExpiry, revealedStepIds, type SurpriseOffer } from "../../domain/surprise";
import type { UserMission } from "../../domain/user-mission";
import { AcceptMission } from "../accept-mission/accept-mission.use-case";
import { findSurpriseSchema, respondSurpriseSchema } from "./surprise-missions.schema";
import { OfferSurpriseMission, RespondSurpriseOffer } from "./surprise-missions.use-case";

const NOW = new Date("2026-10-15T15:00:00Z");
const now = () => NOW;
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
const ORIGIN = { lat: -26.3045, lon: -48.8456 };

const surprise = (id: string, patch: Partial<MissionRecord> = {}): MissionRecord => ({
  id,
  ownerId: "parceiro",
  title: `Surpresa ${id}`,
  description: "Uma missão inesperada no Centro.",
  xp: 90,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  surprise: true,
  steps: [
    { id: `${id}-2`, missionId: id, position: 2, title: "Segunda", placeId: `${id}-lugar-2`, validation: "qr" },
    { id: `${id}-1`, missionId: id, position: 1, title: "Primeira", placeId: `${id}-lugar-1`, validation: "qr" },
  ],
  ...patch,
});

const offerOf = (missionId: string, patch: Partial<SurpriseOffer> = {}): SurpriseOffer => ({
  id: `o-${missionId}`,
  userId: "ana",
  missionId,
  offeredAt: NOW,
  expiresAt: minutes(30),
  status: "offered",
  ...patch,
});

const accepted = (missionId: string): UserMission => ({ id: `um-${missionId}`, userId: "ana", missionId, status: "active", acceptedAt: NOW, completedAt: null });

function offering(opts: { missions?: MissionRecord[]; distances?: Record<string, number>; open?: SurpriseOffer[]; offered?: string[]; mine?: UserMission[]; active?: number } = {}) {
  const missions = opts.missions ?? [surprise("a"), surprise("b")];
  const offers = {
    listOpen: vi.fn().mockResolvedValue(opts.open ?? []),
    find: vi.fn(),
    offeredMissionIds: vi.fn().mockResolvedValue(new Set(opts.offered ?? [])),
    create: vi.fn(async (_u: string, missionId: string, expiresAt: Date) => offerOf(missionId, { expiresAt })),
    accept: vi.fn(),
    dismiss: vi.fn(),
  };
  const distances = vi.fn(async (_o: unknown, ids: string[]) => new Map(ids.flatMap((id) => (opts.distances?.[id] !== undefined ? [[id, opts.distances[id]] as const] : []))));
  const useCase = new OfferSurpriseMission(
    { listAvailableSurprises: vi.fn().mockResolvedValue(missions), findByIds: vi.fn(async (ids: string[]) => missions.filter((m) => ids.includes(m.id))) },
    offers,
    { listByUser: vi.fn().mockResolvedValue(opts.mine ?? []), countActive: vi.fn().mockResolvedValue(opts.active ?? 0) },
    distances,
    now,
  );
  return { useCase, offers, distances };
}

describe("regras puras da missão surpresa", () => {
  it("a oferta vale 30 min, mas nunca depois do fim da missão", () => {
    expect(offerExpiry(NOW, minutes(120))).toEqual(minutes(30));
    expect(offerExpiry(NOW, minutes(10))).toEqual(minutes(10));
  });

  it("revela as etapas uma por vez: nenhuma antes do aceite; depois as concluídas e a próxima", () => {
    const steps = surprise("a").steps;
    expect(revealedStepIds(steps, null, new Set())).toEqual(new Set());
    expect(revealedStepIds(steps, { status: "active" }, new Set())).toEqual(new Set(["a-1"]));
    expect(revealedStepIds(steps, { status: "active" }, new Set(["a-1"]))).toEqual(new Set(["a-1", "a-2"]));
    expect(revealedStepIds(steps, { status: "completed" }, new Set())).toEqual(new Set(["a-1", "a-2"]));
  });
});

describe("OfferSurpriseMission: gatilho por proximidade e horário", () => {
  it("oferece a mais perto (pela primeira etapa) dentro de 1 km, com validade curta", async () => {
    const { useCase, offers, distances } = offering({ distances: { "a-lugar-1": 800, "b-lugar-1": 300 } });
    const res = await useCase.findNear("ana", ORIGIN);
    expect(res.ok && res.value).toEqual({
      missionId: "b",
      title: "Surpresa b",
      description: "Uma missão inesperada no Centro.",
      xp: 90,
      stepCount: 2,
      expiresAt: minutes(30),
      distanceMeters: 300,
    });
    // A distância é só até a primeira etapa (as outras continuam secretas).
    expect(distances).toHaveBeenCalledWith(ORIGIN, ["a-lugar-1", "b-lugar-1"]);
    expect(offers.create).toHaveBeenCalledWith("ana", "b", minutes(30));
  });

  it("nada por perto (mais de 1 km): não oferece", async () => {
    const { useCase, offers } = offering({ distances: { "a-lugar-1": 1500 } });
    const res = await useCase.findNear("ana", ORIGIN);
    expect(res.ok && res.value).toBeNull();
    expect(offers.create).not.toHaveBeenCalled();
  });

  it("não oferece de novo a já oferecida (ignorada/expirada), a já aceita, a própria nem a que está acabando", async () => {
    const { useCase, offers } = offering({
      missions: [surprise("a"), surprise("b"), surprise("c", { ownerId: "ana" }), surprise("d", { endsAt: minutes(45) })],
      distances: { "a-lugar-1": 10, "b-lugar-1": 10, "c-lugar-1": 10, "d-lugar-1": 10 },
      offered: ["a"],
      mine: [accepted("b")],
    });
    const res = await useCase.findNear("ana", ORIGIN);
    expect(res.ok && res.value).toBeNull();
    expect(offers.create).not.toHaveBeenCalled();
  });

  it("com uma oferta aberta, devolve ela em vez de criar outra", async () => {
    const { useCase, offers } = offering({ open: [offerOf("a", { expiresAt: minutes(12) })], distances: { "b-lugar-1": 10 } });
    const res = await useCase.findNear("ana", ORIGIN);
    expect(res.ok && res.value).toMatchObject({ missionId: "a", expiresAt: minutes(12), distanceMeters: null });
    expect(offers.create).not.toHaveBeenCalled();
  });

  it("com 5 missões em andamento, não oferece", async () => {
    const { useCase } = offering({ active: 5, distances: { "a-lugar-1": 10 } });
    const res = await useCase.findNear("ana", ORIGIN);
    expect(!res.ok && res.error.code).toBe("too_many_active_missions");
  });
});

describe("RespondSurpriseOffer: aceitar ou ignorar", () => {
  function responding(offer: SurpriseOffer | null, opts: { mission?: MissionRecord; active?: number } = {}) {
    const offers = {
      find: vi.fn().mockResolvedValue(offer),
      accept: vi.fn().mockResolvedValue(accepted("a")),
      dismiss: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new RespondSurpriseOffer({ findById: vi.fn().mockResolvedValue(opts.mission ?? surprise("a")) }, offers, { countActive: vi.fn().mockResolvedValue(opts.active ?? 0) }, now);
    return { useCase, offers };
  }

  it("aceitar a oferta aberta cria o aceite", async () => {
    const { useCase, offers } = responding(offerOf("a"));
    const res = await useCase.execute("ana", "a", "accept");
    expect(res.ok && res.value).toEqual({ decision: "accept", missionId: "a", userMission: accepted("a") });
    expect(offers.accept).toHaveBeenCalledWith("ana", "a");
  });

  it("ignorar marca a oferta e não aceita", async () => {
    const { useCase, offers } = responding(offerOf("a"));
    expect((await useCase.execute("ana", "a", "dismiss")).ok).toBe(true);
    expect(offers.dismiss).toHaveBeenCalledWith("ana", "a");
    expect(offers.accept).not.toHaveBeenCalled();
  });

  it.each([
    ["sem oferta", null, "not_found"],
    ["oferta expirada", offerOf("a", { expiresAt: minutes(-1) }), "surprise_expired"],
    ["oferta já respondida", offerOf("a", { status: "dismissed" }), "surprise_answered"],
  ])("%s: não aceita", async (_, offer, code) => {
    const { useCase, offers } = responding(offer);
    const res = await useCase.execute("ana", "a", "accept");
    expect(!res.ok && res.error.code).toBe(code);
    expect(offers.accept).not.toHaveBeenCalled();
  });

  it("regras de aceite valem também na surpresa (limite de missões ativas, prazo)", async () => {
    expect(await responding(offerOf("a"), { active: 5 }).useCase.execute("ana", "a", "accept")).toMatchObject({ ok: false, error: { code: "too_many_active_missions" } });
    expect(await responding(offerOf("a"), { mission: surprise("a", { status: "archived" }) }).useCase.execute("ana", "a", "accept")).toMatchObject({
      ok: false,
      error: { code: "mission_unavailable" },
    });
  });

  it("o aceite comum (lista) recusa missão surpresa: só pela oferta", async () => {
    const userMissions = { find: vi.fn().mockResolvedValue(null), listByUser: vi.fn(), countActive: vi.fn().mockResolvedValue(0), accept: vi.fn() };
    const res = await new AcceptMission({ findById: vi.fn().mockResolvedValue(surprise("a")) }, userMissions, now).execute("ana", "a");
    expect(!res.ok && res.error.code).toBe("surprise_requires_offer");
    expect(userMissions.accept).not.toHaveBeenCalled();
  });
});

describe("validação de entrada", () => {
  it("posição na área atendida e resposta conhecida", () => {
    expect(findSurpriseSchema.safeParse({ lat: "-26.304567", lon: "-48.8456" }).data).toEqual({ lat: -26.3046, lon: -48.8456 });
    expect(findSurpriseSchema.safeParse({ lat: "-23.5", lon: "-46.6" }).success).toBe(false);
    expect(respondSurpriseSchema.safeParse({ missionId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f", decision: "accept" }).success).toBe(true);
    expect(respondSurpriseSchema.safeParse({ missionId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f", decision: "talvez" }).success).toBe(false);
  });
});
