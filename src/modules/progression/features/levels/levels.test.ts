import { describe, expect, it, vi } from "vitest";
import { LEVELS, levelDefinition, levelFor, type LevelUpRepository } from "../../domain/levels";
import { GetLevelOverview, LEVEL_UP_HIGHLIGHT_MS, TrackLevelUp } from "./levels.use-case";

const ANA = "11111111-1111-4111-8111-111111111111";
const EVT = "44444444-4444-4444-8444-444444444444";

describe("levelFor (tabela de níveis)", () => {
  it("a tabela começa em 0 XP, é crescente e numerada em sequência", () => {
    expect(LEVELS[0].minXp).toBe(0);
    LEVELS.forEach((l, i) => {
      expect(l.level).toBe(i + 1);
      if (i > 0) expect(l.minXp).toBeGreaterThan(LEVELS[i - 1].minXp);
    });
  });

  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [249, 2],
    [250, 3],
    [1999, 6],
    [2000, 7],
    [50_000, 7],
  ])("%i XP → nível %i", (xp, level) => {
    expect(levelFor(xp).level).toBe(level);
  });

  it("progresso e quanto falta até o próximo", () => {
    expect(levelFor(175)).toMatchObject({ level: 2, xp: 175, minXp: 100, remaining: 75, percent: 50, next: { level: 3, minXp: 250 } });
    expect(levelFor(0)).toMatchObject({ remaining: 100, percent: 0 });
  });

  it("no nível máximo: sem próximo, 100% e nada faltando", () => {
    expect(levelFor(9999)).toMatchObject({ level: 7, next: null, remaining: 0, percent: 100 });
  });

  it("XP negativo, fracionado ou inválido conta como o piso", () => {
    expect(levelFor(-50)).toMatchObject({ level: 1, xp: 0 });
    expect(levelFor(Number.NaN)).toMatchObject({ level: 1, xp: 0 });
    expect(levelFor(100.9).xp).toBe(100);
  });

  it("aceita outra tabela (configurável)", () => {
    const table = [
      { level: 1, name: "A", minXp: 0 },
      { level: 2, name: "B", minXp: 10 },
    ];
    expect(levelFor(10, table)).toMatchObject({ level: 2, name: "B", next: null });
  });

  it("levelDefinition pelo número", () => {
    expect(levelDefinition(3)?.minXp).toBe(250);
    expect(levelDefinition(99)).toBeNull();
  });
});

function memoryLevelUps() {
  const rows = new Set<string>();
  const repo: Pick<LevelUpRepository, "record"> = { record: vi.fn(async (u: string, l: number) => (rows.has(`${u}:${l}`) ? false : (rows.add(`${u}:${l}`), true))) };
  return { rows, repo };
}

describe("TrackLevelUp", () => {
  const granted = (amount = 10) => ({ id: EVT, payload: { userId: ANA, amount, reason: "mission_step" } });

  it("ao passar de nível, registra e publica progression.LevelReached", async () => {
    const { repo } = memoryLevelUps();
    const events = { publish: vi.fn() };
    const level = await new TrackLevelUp({ balanceOf: vi.fn().mockResolvedValue(260) }, repo, events).onXpGranted(granted());
    expect(level).toBe(3);
    expect(events.publish).toHaveBeenCalledWith("progression.LevelReached", { userId: ANA, level: 3 });
  });

  it("idempotente: o mesmo nível não é publicado duas vezes", async () => {
    const { repo } = memoryLevelUps();
    const events = { publish: vi.fn() };
    const track = new TrackLevelUp({ balanceOf: vi.fn().mockResolvedValue(120) }, repo, events);
    await track.onXpGranted(granted());
    await track.onXpGranted(granted());
    expect(events.publish).toHaveBeenCalledOnce();
  });

  it("no nível 1 não registra nem publica", async () => {
    const { repo } = memoryLevelUps();
    const events = { publish: vi.fn() };
    expect(await new TrackLevelUp({ balanceOf: vi.fn().mockResolvedValue(40) }, repo, events).onXpGranted(granted())).toBeNull();
    expect(repo.record).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("payload inválido é recusado", async () => {
    const { repo } = memoryLevelUps();
    await expect(new TrackLevelUp({ balanceOf: vi.fn() }, repo, { publish: vi.fn() }).onXpGranted({ id: EVT, payload: { userId: "x" } })).rejects.toThrow();
  });
});

describe("GetLevelOverview", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("nível, progresso e a subida recente (destaque no perfil)", async () => {
    const latest = vi.fn().mockResolvedValue({ level: 2, reachedAt: new Date(now.getTime() - 60_000) });
    const overview = await new GetLevelOverview({ balanceOf: vi.fn().mockResolvedValue(150) }, { latest }, () => now).execute(ANA);
    expect(overview).toMatchObject({ level: 2, remaining: 100, recentLevelUp: { level: 2 } });
  });

  it("subida antiga não é destacada", async () => {
    const latest = vi.fn().mockResolvedValue({ level: 2, reachedAt: new Date(now.getTime() - LEVEL_UP_HIGHLIGHT_MS - 1) });
    const overview = await new GetLevelOverview({ balanceOf: vi.fn().mockResolvedValue(150) }, { latest }, () => now).execute(ANA);
    expect(overview.recentLevelUp).toBeNull();
  });

  it("sem XP: nível 1, sem destaque", async () => {
    const overview = await new GetLevelOverview({ balanceOf: vi.fn().mockResolvedValue(0) }, { latest: vi.fn().mockResolvedValue(null) }, () => now).execute(ANA);
    expect(overview).toMatchObject({ level: 1, recentLevelUp: null });
  });

  it("id inválido é recusado", async () => {
    await expect(new GetLevelOverview({ balanceOf: vi.fn() }, { latest: vi.fn() }).execute("nao-e-uuid")).rejects.toThrow();
  });
});
