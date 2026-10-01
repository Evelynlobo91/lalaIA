import { describe, expect, it, vi } from "vitest";
import type { AchievementFacts, AchievementRepository, AchievementRule, UnlockedAchievement } from "../../domain/achievements";
import type { ExplorerActivity } from "../../domain/explorer-activity";
import { ACHIEVEMENTS } from "./achievement-catalog";
import { CategoriesRule, FavoritePlacesRule, FirstCheckInRule, FirstMissionRule, LevelRule } from "./achievement-rules";
import { ExplorerAchievementFacts, GetAchievements, UnlockAchievements } from "./achievements.use-case";

const ANA = "11111111-1111-4111-8111-111111111111";
const EVT = "44444444-4444-4444-8444-444444444444";
const none: AchievementFacts = { completedMissions: 0, checkIns: 0, favoritePlaces: 0, exploredCategories: 0, level: 1 };

describe("regras de conquista (estratégias)", () => {
  it.each<[AchievementRule, Partial<AchievementFacts>, Partial<AchievementFacts>]>([
    [new FirstMissionRule(), { completedMissions: 1 }, { checkIns: 3 }],
    [new FirstCheckInRule(), { checkIns: 1 }, { favoritePlaces: 9 }],
    [new FavoritePlacesRule(5), { favoritePlaces: 5 }, { favoritePlaces: 4 }],
    [new CategoriesRule(3), { exploredCategories: 3 }, { exploredCategories: 2 }],
    [new LevelRule(3), { level: 3 }, { level: 2 }],
  ])("%o: atende e não atende", (rule, yes, no) => {
    expect(rule.isMet({ ...none, ...yes })).toBe(true);
    expect(rule.isMet({ ...none, ...no })).toBe(false);
  });

  it("o catálogo tem ids únicos, estáveis e válidos para o banco, com título e dica", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9-]{1,60}$/);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
      expect(a.bonusXp).toBeGreaterThanOrEqual(0);
    }
    expect(ids).toEqual(["primeiro-check-in", "primeira-missao", "favoritou-5-lugares", "explorou-3-categorias", "nivel-3"]);
  });

  it("a conquista de nível usa o nome temático do nível", () => {
    expect(new LevelRule(3).title).toBe("Florista da Festa das Flores");
  });
});

function memoryRepo(initial: UnlockedAchievement[] = []) {
  const rows = [...initial];
  const repo: Pick<AchievementRepository, "unlock" | "listUnlocked"> = {
    unlock: vi.fn(async (_u: string, id: string) => {
      if (rows.some((r) => r.achievementId === id)) return null;
      const unlockId = crypto.randomUUID();
      rows.push({ achievementId: id, unlockId, unlockedAt: new Date() });
      return unlockId;
    }),
    listUnlocked: vi.fn(async () => [...rows]),
  };
  return { rows, repo };
}

describe("UnlockAchievements", () => {
  const trigger = { id: EVT, payload: { userId: ANA, missionId: "qualquer" } };

  it("desbloqueia as regras atendidas e publica AchievementUnlocked com o bônus", async () => {
    const { repo } = memoryRepo();
    const events = { publish: vi.fn() };
    const facts = { factsOf: vi.fn().mockResolvedValue({ ...none, checkIns: 1, completedMissions: 1 }) };
    const unlocked = await new UnlockAchievements(ACHIEVEMENTS, facts, repo, events).onTrigger(trigger);
    expect(unlocked).toEqual(["primeiro-check-in", "primeira-missao"]);
    expect(events.publish).toHaveBeenCalledWith("progression.AchievementUnlocked", expect.objectContaining({ userId: ANA, achievementId: "primeira-missao", title: "Primeira missão", bonusXp: 25, unlockId: expect.any(String) }));
  });

  it("idempotente: reprocessar não desbloqueia nem publica de novo", async () => {
    const { repo } = memoryRepo();
    const events = { publish: vi.fn() };
    const facts = { factsOf: vi.fn().mockResolvedValue({ ...none, checkIns: 1 }) };
    const unlock = new UnlockAchievements(ACHIEVEMENTS, facts, repo, events);
    await unlock.onTrigger(trigger);
    expect(await unlock.onTrigger(trigger)).toEqual([]);
    expect(events.publish).toHaveBeenCalledOnce();
  });

  it("corrida: se outro processo gravou antes (unique), não publica", async () => {
    const events = { publish: vi.fn() };
    const repo = { unlock: vi.fn().mockResolvedValue(null), listUnlocked: vi.fn().mockResolvedValue([]) };
    const facts = { factsOf: vi.fn().mockResolvedValue({ ...none, checkIns: 1 }) };
    expect(await new UnlockAchievements(ACHIEVEMENTS, facts, repo, events).onTrigger(trigger)).toEqual([]);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("com tudo desbloqueado, nem consulta os fatos", async () => {
    const { repo } = memoryRepo(ACHIEVEMENTS.map((a) => ({ achievementId: a.id, unlockId: crypto.randomUUID(), unlockedAt: new Date() })));
    const facts = { factsOf: vi.fn() };
    await new UnlockAchievements(ACHIEVEMENTS, facts, repo, { publish: vi.fn() }).onTrigger(trigger);
    expect(facts.factsOf).not.toHaveBeenCalled();
  });

  it("nova conquista entra só como nova regra (OCP)", async () => {
    const custom: AchievementRule = { id: "teste", title: "Teste", description: "d", hint: "h", bonusXp: 0, isMet: () => true };
    const { repo } = memoryRepo();
    expect(await new UnlockAchievements([custom], { factsOf: vi.fn().mockResolvedValue(none) }, repo, { publish: vi.fn() }).onTrigger(trigger)).toEqual(["teste"]);
  });

  it("payload sem usuário válido é recusado", async () => {
    const { repo } = memoryRepo();
    await expect(new UnlockAchievements(ACHIEVEMENTS, { factsOf: vi.fn() }, repo, { publish: vi.fn() }).onTrigger({ id: EVT, payload: { userId: "x" } })).rejects.toThrow();
  });
});

describe("ExplorerAchievementFacts", () => {
  it("deriva os fatos da atividade e do saldo de XP", async () => {
    const activity: ExplorerActivity = {
      completedMissions: 1,
      checkIns: 2,
      visitedPlaceIds: ["p3"],
      favoritePlaceIds: ["p1", "p2"],
      favoriteEventIds: ["e1"],
      places: [
        { id: "p1", category: "cafes", neighborhood: "Centro" },
        { id: "p2", category: "cafes", neighborhood: "América" },
        { id: "p3", category: "ar-livre", neighborhood: null },
      ],
      events: [{ id: "e1", category: "shows", neighborhood: "Centro" }],
    };
    const facts = await new ExplorerAchievementFacts({ activityOf: vi.fn().mockResolvedValue(activity) }, { balanceOf: vi.fn().mockResolvedValue(260) }).factsOf(ANA);
    expect(facts).toEqual({ completedMissions: 1, checkIns: 2, favoritePlaces: 2, exploredCategories: 3, level: 3 });
  });
});

describe("GetAchievements", () => {
  it("desbloqueadas (mais recentes primeiro) e bloqueadas na ordem do catálogo, com dica", async () => {
    const { repo } = memoryRepo([
      { achievementId: "primeiro-check-in", unlockId: "u1", unlockedAt: new Date("2026-09-01T10:00:00Z") },
      { achievementId: "primeira-missao", unlockId: "u2", unlockedAt: new Date("2026-09-02T10:00:00Z") },
    ]);
    const overview = await new GetAchievements(ACHIEVEMENTS, repo).execute(ANA);
    expect(overview.total).toBe(ACHIEVEMENTS.length);
    expect(overview.unlocked.map((a) => a.id)).toEqual(["primeira-missao", "primeiro-check-in"]);
    expect(overview.locked.map((a) => a.id)).toEqual(["favoritou-5-lugares", "explorou-3-categorias", "nivel-3"]);
    expect(overview.locked[0]).toMatchObject({ hint: "Favorite 5 lugares que você quer conhecer.", unlockedAt: null });
  });

  it("id inválido é recusado", async () => {
    await expect(new GetAchievements(ACHIEVEMENTS, { listUnlocked: vi.fn() }).execute("x")).rejects.toThrow();
  });
});
