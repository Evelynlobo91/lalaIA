import { describe, expect, it, vi } from "vitest";
import type { MissionRecord } from "../../domain/mission";
import type { MissionReward, MissionRewardRepository, RewardClaim, RewardClaimRepository } from "../../domain/reward";
import type { UserMission } from "../../domain/user-mission";
import { claimRewardSchema, saveRewardSchema, validateRewardCodeSchema } from "./rewards.schema";
import { ClaimMissionReward, GetMissionReward, GetPartnerRewardPanel, REWARD_MESSAGES, SaveMissionReward, ValidateRewardCode } from "./rewards.use-case";

const MISSION_ID = "6f1f2a64-2d8e-4c8b-9a51-0d6a1c9b7e01";
const parceiro = { id: "parceiro", isPartner: true };

const mission = (patch: Partial<MissionRecord> = {}): MissionRecord => ({
  id: MISSION_ID,
  ownerId: "parceiro",
  title: "Rota do Chope",
  description: "Conheça as cervejarias do Centro.",
  xp: 100,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  steps: [
    { id: "s1", missionId: MISSION_ID, position: 1, title: "Peça o chope", placeId: "bar", validation: "qr" },
    { id: "s2", missionId: MISSION_ID, position: 2, title: "Prove o pastel", placeId: "bar", validation: "qr_gps", geofence: { radiusMeters: 100, dwellMinutes: 0 } },
  ],
  ...patch,
});
const gpsOnly = () =>
  mission({ steps: [{ id: "s1", missionId: MISSION_ID, position: 1, title: "Passe na praça", placeId: "praca", validation: "gps", geofence: { radiusMeters: 100, dwellMinutes: 2 } }] });

const reward = (patch: Partial<MissionReward> = {}): MissionReward => ({
  missionId: MISSION_ID,
  description: "1 chope grátis",
  stock: 10,
  claimedCount: 0,
  createdAt: new Date("2026-10-02T00:00:00Z"),
  ...patch,
});
const claim = (patch: Partial<RewardClaim> = {}): RewardClaim => ({
  id: "c1",
  missionId: MISSION_ID,
  userId: "ana",
  code: "ABCDEFGH",
  claimedAt: new Date("2026-10-15T12:00:00Z"),
  validatedAt: null,
  ...patch,
});
const completed = (patch: Partial<UserMission> = {}): UserMission => ({
  id: "um1",
  userId: "ana",
  missionId: MISSION_ID,
  status: "completed",
  acceptedAt: new Date("2026-10-10T00:00:00Z"),
  completedAt: new Date("2026-10-15T11:00:00Z"),
  ...patch,
});

const missions = (m: MissionRecord | null = mission()) => ({ findById: vi.fn().mockResolvedValue(m) });
const userMissions = (um: UserMission | null = completed()) => ({ find: vi.fn().mockResolvedValue(um) });
const rewards = (r: MissionReward | null = reward(), patch: Partial<MissionRewardRepository> = {}): MissionRewardRepository => ({
  find: vi.fn().mockResolvedValue(r),
  save: vi.fn(async (_actor, missionId, draft) => reward({ missionId, ...draft })),
  countValidated: vi.fn().mockResolvedValue(0),
  ...patch,
});
const claims = (patch: Partial<RewardClaimRepository> = {}): RewardClaimRepository => ({
  findMine: vi.fn().mockResolvedValue(null),
  listMine: vi.fn().mockResolvedValue([]),
  claim: vi.fn(async (userId, missionId, code) => ({ kind: "claimed" as const, claim: claim({ userId, missionId, code }), created: true })),
  findForOwner: vi.fn().mockResolvedValue(claim()),
  markValidated: vi.fn().mockResolvedValue(claim({ validatedAt: new Date("2026-10-15T13:00:00Z") })),
  ...patch,
});
const bus = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

describe("SaveMissionReward", () => {
  const draft = { description: "1 chope grátis", stock: 50 };

  it("o parceiro dono vincula a recompensa em missão só com QR", async () => {
    const repo = rewards(null);
    const res = await new SaveMissionReward(missions(), repo).execute(parceiro, MISSION_ID, draft);
    expect(res.ok && res.value).toMatchObject({ description: "1 chope grátis", stock: 50 });
    expect(repo.save).toHaveBeenCalledWith("parceiro", MISSION_ID, draft);
  });

  it("edita livremente até o primeiro resgate", async () => {
    const repo = rewards(reward({ claimedCount: 0 }));
    const res = await new SaveMissionReward(missions(), repo).execute(parceiro, MISSION_ID, { description: "2 chopes", stock: null });
    expect(res.ok).toBe(true);
  });

  it("recusa missão com etapa só por GPS, explicando o motivo", async () => {
    const repo = rewards(null);
    const res = await new SaveMissionReward(missions(gpsOnly()), repo).execute(parceiro, MISSION_ID, draft);
    expect(!res.ok && res.error).toMatchObject({ code: "reward_requires_qr", message: REWARD_MESSAGES.requiresQr });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it.each([
    ["depois do primeiro resgate", parceiro, mission(), reward({ claimedCount: 1 }), "reward_locked"],
    ["em missão encerrada", parceiro, mission({ status: "archived" }), null, "mission_archived"],
    ["por quem não é o dono", { id: "outro", isPartner: true }, mission(), null, "forbidden"],
    ["por quem não é parceiro", { id: "parceiro", isPartner: false }, mission(), null, "forbidden"],
  ])("não salva %s", async (_, owner, m, r, code) => {
    const repo = rewards(r);
    const res = await new SaveMissionReward(missions(m), repo).execute(owner, MISSION_ID, draft);
    expect(!res.ok && res.error.code).toBe(code);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("missão inexistente → 404", async () => {
    const res = await new SaveMissionReward(missions(null), rewards()).execute(parceiro, MISSION_ID, draft);
    expect(!res.ok && res.error.code).toBe("not_found");
  });
});

describe("ClaimMissionReward", () => {
  it("quem concluiu a missão resgata: gera o código e publica o evento", async () => {
    const events = bus();
    const repo = claims();
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(), repo, events, () => "ABCDEFGH").execute("ana", MISSION_ID);
    expect(res.ok && res.value).toMatchObject({ created: true, claim: { code: "ABCDEFGH", userId: "ana" } });
    expect(events.publish).toHaveBeenCalledWith("missions.RewardClaimed", { userId: "ana", missionId: MISSION_ID, claimId: "c1" });
  });

  it("é idempotente: resgatar de novo devolve o mesmo código e não publica", async () => {
    const events = bus();
    const repo = claims({ findMine: vi.fn().mockResolvedValue(claim({ code: "ZZZZ2222" })) });
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(), repo, events).execute("ana", MISSION_ID);
    expect(res.ok && res.value).toMatchObject({ created: false, claim: { code: "ZZZZ2222" } });
    expect(repo.claim).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("corrida da mesma pessoa (o banco devolveu o resgate existente) não publica de novo", async () => {
    const events = bus();
    const repo = claims({ claim: vi.fn().mockResolvedValue({ kind: "claimed", claim: claim(), created: false }) });
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(), repo, events).execute("ana", MISSION_ID);
    expect(res.ok && res.value.created).toBe(false);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["sem ter concluído", userMissions(completed({ status: "active", completedAt: null })), "mission_not_completed"],
    ["sem ter aceitado", userMissions(null), "mission_not_completed"],
  ])("não resgata %s", async (_, um, code) => {
    const repo = claims();
    const res = await new ClaimMissionReward(missions(), um, rewards(), repo, bus()).execute("ana", MISSION_ID);
    expect(!res.ok && res.error).toMatchObject({ code, message: REWARD_MESSAGES.notCompleted });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("missão que deixou de dar prêmio real (etapa por GPS) não resgata", async () => {
    const res = await new ClaimMissionReward(missions(gpsOnly()), userMissions(), rewards(), claims(), bus()).execute("ana", MISSION_ID);
    expect(!res.ok && res.error.code).toBe("reward_unavailable");
  });

  it("missão sem recompensa → 404", async () => {
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(null), claims(), bus()).execute("ana", MISSION_ID);
    expect(!res.ok && res.error.code).toBe("not_found");
  });

  it("esgotada (na leitura ou no banco): mensagem clara, sem evento", async () => {
    const events = bus();
    const read = await new ClaimMissionReward(missions(), userMissions(), rewards(reward({ stock: 3, claimedCount: 3 })), claims(), events).execute("ana", MISSION_ID);
    expect(!read.ok && read.error).toMatchObject({ code: "reward_sold_out", message: REWARD_MESSAGES.soldOut });

    const race = await new ClaimMissionReward(missions(), userMissions(), rewards(), claims({ claim: vi.fn().mockResolvedValue({ kind: "sold_out" }) }), events).execute(
      "ana",
      MISSION_ID,
    );
    expect(!race.ok && race.error.message).toContain("continua concluída, com o XP");
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("colisão de código: sorteia outro", async () => {
    const codes = ["AAAAAAAA", "BBBBBBBB"];
    const claimFn = vi
      .fn()
      .mockResolvedValueOnce({ kind: "code_taken" })
      .mockImplementationOnce(async (_u: string, _m: string, code: string) => ({ kind: "claimed", claim: claim({ code }), created: true }));
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(), claims({ claim: claimFn }), bus(), () => codes.shift()!).execute("ana", MISSION_ID);
    expect(res.ok && res.value.claim.code).toBe("BBBBBBBB");
    expect(claimFn).toHaveBeenCalledTimes(2);
  });

  it("RLS recusou na gravação → indisponível", async () => {
    const res = await new ClaimMissionReward(missions(), userMissions(), rewards(), claims({ claim: vi.fn().mockResolvedValue({ kind: "unavailable" }) }), bus()).execute(
      "ana",
      MISSION_ID,
    );
    expect(!res.ok && res.error.code).toBe("reward_unavailable");
  });
});

describe("ValidateRewardCode", () => {
  it("o parceiro dono valida o código no balcão (normalizado) e publica o evento", async () => {
    const events = bus();
    const repo = claims();
    const res = await new ValidateRewardCode(missions(), rewards(), repo, events).execute(parceiro, MISSION_ID, " abcd-efgh ");
    expect(res.ok && res.value).toMatchObject({ missionId: MISSION_ID, code: "ABCDEFGH", description: "1 chope grátis" });
    expect(repo.findForOwner).toHaveBeenCalledWith("parceiro", MISSION_ID, "ABCDEFGH");
    expect(events.publish).toHaveBeenCalledWith("missions.RewardValidated", { userId: "ana", missionId: MISSION_ID, claimId: "c1", validatedBy: "parceiro" });
  });

  it.each([
    ["inexistente ou de outra missão", mission(), claims({ findForOwner: vi.fn().mockResolvedValue(null) }), "ABCD-EFGH"],
    ["mal formado", mission(), claims(), "ABCD-EFG0"],
    ["numa missão de outro parceiro", mission({ ownerId: "outro" }), claims(), "ABCD-EFGH"],
  ])("código %s recebe a mesma resposta: Código inválido.", async (_, m, repo, code) => {
    const events = bus();
    const res = await new ValidateRewardCode(missions(m), rewards(), repo, events).execute(parceiro, MISSION_ID, code);
    expect(!res.ok && res.error).toMatchObject({ code: "invalid_code", message: "Código inválido." });
    expect(repo.markValidated).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("vale uma vez só: já usado (na leitura ou na corrida) é recusado sem evento", async () => {
    const events = bus();
    const used = claims({ findForOwner: vi.fn().mockResolvedValue(claim({ validatedAt: new Date("2026-10-15T13:00:00Z") })) });
    const read = await new ValidateRewardCode(missions(), rewards(), used, events).execute(parceiro, MISSION_ID, "ABCDEFGH");
    expect(!read.ok && read.error.message).toMatch(/já foi usado em/);

    const race = await new ValidateRewardCode(missions(), rewards(), claims({ markValidated: vi.fn().mockResolvedValue(null) }), events).execute(parceiro, MISSION_ID, "ABCDEFGH");
    expect(!race.ok && race.error.code).toBe("code_used");
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("quem não é parceiro não valida", async () => {
    const res = await new ValidateRewardCode(missions(), rewards(), claims(), bus()).execute({ id: "parceiro", isPartner: false }, MISSION_ID, "ABCDEFGH");
    expect(!res.ok && res.error.code).toBe("forbidden");
  });
});

describe("GetMissionReward", () => {
  const view = (um: UserMission | null, r = reward(), mine: RewardClaim | null = null, m = mission(), userId: string | null = "ana") =>
    new GetMissionReward(missions(m), userMissions(um), rewards(r), claims({ findMine: vi.fn().mockResolvedValue(mine) })).execute(userId, MISSION_ID);

  it("visitante e quem não concluiu veem o prêmio como incentivo", async () => {
    expect(await view(null, reward(), null, mission(), null)).toMatchObject({ state: "locked", description: "1 chope grátis", remaining: 10 });
    expect((await view(completed({ status: "active", completedAt: null })))?.state).toBe("locked");
  });

  it("concluiu: pode resgatar; esgotada: avisa", async () => {
    expect((await view(completed()))?.state).toBe("claimable");
    expect(await view(completed(), reward({ stock: 2, claimedCount: 2 }))).toMatchObject({ state: "sold_out", remaining: 0 });
    expect((await view(completed(), reward({ stock: null })))?.remaining).toBeNull();
  });

  it("já resgatou: mostra o código", async () => {
    expect(await view(completed(), reward(), claim())).toMatchObject({ state: "claimed", claim: { code: "ABCDEFGH", validatedAt: null } });
  });

  it("sem recompensa ou missão que não dá prêmio real → nada", async () => {
    expect(await view(completed(), null as unknown as MissionReward)).toBeNull();
    expect(await view(completed(), reward(), null, gpsOnly())).toBeNull();
  });
});

describe("GetPartnerRewardPanel", () => {
  it("só o dono vê o painel, com a regra do QR e o travamento", async () => {
    const panel = await new GetPartnerRewardPanel(missions(), rewards(reward({ claimedCount: 2 }), { countValidated: vi.fn().mockResolvedValue(1) })).execute(parceiro, MISSION_ID);
    expect(panel).toMatchObject({ allowsRealReward: true, locked: true, validatedCount: 1, mission: { id: MISSION_ID } });
    expect(await new GetPartnerRewardPanel(missions(), rewards()).execute({ id: "outro", isPartner: true }, MISSION_ID)).toBeNull();
    expect((await new GetPartnerRewardPanel(missions(gpsOnly()), rewards(null)).execute(parceiro, MISSION_ID))?.allowsRealReward).toBe(false);
  });
});

describe("schemas", () => {
  it("estoque vazio = sem limite; inválido é recusado", () => {
    expect(saveRewardSchema.parse({ missionId: MISSION_ID, description: " 1 chope grátis ", stock: "" })).toEqual({ missionId: MISSION_ID, description: "1 chope grátis", stock: null });
    expect(saveRewardSchema.parse({ missionId: MISSION_ID, description: "1 chope", stock: "30" }).stock).toBe(30);
    expect(saveRewardSchema.safeParse({ missionId: MISSION_ID, description: "1 chope", stock: "0" }).success).toBe(false);
    expect(saveRewardSchema.safeParse({ missionId: MISSION_ID, description: "1 chope", stock: "2.5" }).success).toBe(false);
    expect(saveRewardSchema.safeParse({ missionId: MISSION_ID, description: "x", stock: "" }).success).toBe(false);
    expect(saveRewardSchema.safeParse({ missionId: "x", description: "1 chope", stock: "" }).success).toBe(false);
  });

  it("resgate e validação exigem id de missão válido", () => {
    expect(claimRewardSchema.safeParse({ missionId: MISSION_ID }).success).toBe(true);
    expect(claimRewardSchema.safeParse({ missionId: "1 or 1=1" }).success).toBe(false);
    expect(validateRewardCodeSchema.safeParse({ missionId: MISSION_ID, code: "" }).success).toBe(false);
  });
});
