import { describe, expect, it, vi } from "vitest";
import type { MissionRecord } from "../../domain/mission";
import { MAX_ACTIVE_MISSIONS, type UserMission, type UserMissionRepository } from "../../domain/user-mission";
import { AcceptMission } from "./accept-mission.use-case";
import { ListAvailableMissions, ListMyMissions } from "./mission-catalog";

const now = () => new Date("2026-10-15T12:00:00Z");
const mission = (patch: Partial<MissionRecord> = {}): MissionRecord => ({
  id: "m1",
  ownerId: "parceiro",
  title: "Rota do Café",
  description: "Conheça os cafés do Centro.",
  xp: 100,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  steps: [
    { id: "s1", missionId: "m1", position: 1, title: "Espresso", placeId: "cafe", validation: "qr" },
    { id: "s2", missionId: "m1", position: 2, title: "Bolo", placeId: "cafe", validation: "qr" },
    { id: "s3", missionId: "m1", position: 3, title: "Chope", placeId: "bar", validation: "qr" },
  ],
  ...patch,
});
const accepted = (patch: Partial<UserMission> = {}): UserMission => ({ id: "um1", userId: "ana", missionId: "m1", status: "active", acceptedAt: now(), completedAt: null, ...patch });
const repo = (patch: Partial<UserMissionRepository> = {}): UserMissionRepository => ({
  find: vi.fn().mockResolvedValue(null),
  listByUser: vi.fn().mockResolvedValue([]),
  countActive: vi.fn().mockResolvedValue(0),
  accept: vi.fn().mockResolvedValue(accepted()),
  ...patch,
});
const missions = (m: MissionRecord | null = mission()) => ({ findById: vi.fn().mockResolvedValue(m) });

describe("AcceptMission", () => {
  it("aceita missão disponível", async () => {
    const userMissions = repo();
    const res = await new AcceptMission(missions(), userMissions, now).execute("ana", "m1");
    expect(res.ok && res.value).toMatchObject({ missionId: "m1", status: "active" });
    expect(userMissions.accept).toHaveBeenCalledWith("ana", "m1");
  });

  it("é idempotente: aceitar de novo devolve o aceite existente", async () => {
    const userMissions = repo({ find: vi.fn().mockResolvedValue(accepted()) });
    const res = await new AcceptMission(missions(), userMissions, now).execute("ana", "m1");
    expect(res.ok && res.value.id).toBe("um1");
    expect(userMissions.accept).not.toHaveBeenCalled();
  });

  it.each([
    ["que ainda não começou", mission({ startsAt: new Date("2026-10-20T00:00:00Z") }), "mission_unavailable"],
    ["que já terminou", mission({ endsAt: new Date("2026-10-10T00:00:00Z") }), "mission_unavailable"],
    ["encerrada", mission({ status: "archived" }), "mission_unavailable"],
    ["criada pela própria pessoa", mission({ ownerId: "ana" }), "own_mission"],
  ])("não aceita missão %s", async (_, m, code) => {
    const userMissions = repo();
    const res = await new AcceptMission(missions(m), userMissions, now).execute("ana", "m1");
    expect(!res.ok && res.error.code).toBe(code);
    expect(userMissions.accept).not.toHaveBeenCalled();
  });

  it(`limita a ${MAX_ACTIVE_MISSIONS} missões ativas`, async () => {
    const userMissions = repo({ countActive: vi.fn().mockResolvedValue(MAX_ACTIVE_MISSIONS) });
    const res = await new AcceptMission(missions(), userMissions, now).execute("ana", "m1");
    expect(!res.ok && res.error.code).toBe("too_many_active_missions");
    expect(userMissions.accept).not.toHaveBeenCalled();
  });

  it("missão inexistente → 404", async () => {
    const res = await new AcceptMission(missions(null), repo(), now).execute("ana", "m1");
    expect(!res.ok && res.error.code).toBe("not_found");
  });
});

describe("ListAvailableMissions / ListMyMissions", () => {
  const places = {
    summaries: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: id === "cafe" ? "Café Central" : "Bar do Zé", neighborhood: "Centro" }))),
  };

  it("monta os cards com os lugares das etapas, sem repetir, numa consulta só", async () => {
    const list = new ListAvailableMissions({ listAvailable: vi.fn().mockResolvedValue([mission()]) }, places, now);
    const [card] = await list.execute();
    expect(card).toMatchObject({ id: "m1", stepCount: 3, places: [{ name: "Café Central" }, { name: "Bar do Zé" }] });
    expect(places.summaries).toHaveBeenCalledTimes(1);
  });

  it("lista as missões aceitas com o aceite", async () => {
    const mine = new ListMyMissions({ findByIds: vi.fn().mockResolvedValue([mission()]) }, { listByUser: vi.fn().mockResolvedValue([accepted()]) }, places);
    const [item] = await mine.execute("ana");
    expect(item).toMatchObject({ id: "m1", userMission: { id: "um1", status: "active" } });
  });
});
