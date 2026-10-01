import { describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS } from "../achievements/achievement-catalog";
import { GetSharedAchievement, ctaFor, shareText } from "./share.use-case";

const ID = "7d0e7e43-5b7a-4a43-9a3c-2f0c6b0e9a11";
const unlockedAt = new Date("2026-10-10T20:00:00Z");

function setup(found: { achievementId: string; userId: string; unlockedAt: Date } | null, name: string | null = "Ana") {
  const reader = { findByUnlockId: vi.fn().mockResolvedValue(found) };
  const names = { firstNameOf: vi.fn().mockResolvedValue(name) };
  return { reader, names, useCase: new GetSharedAchievement(ACHIEVEMENTS, reader, names) };
}

describe("GetSharedAchievement", () => {
  it("monta a página com título do catálogo, primeiro nome e o convite certo", async () => {
    const { useCase, names } = setup({ achievementId: "favoritou-5-lugares", userId: "u1", unlockedAt });
    const view = await useCase.execute(ID);
    expect(view).toMatchObject({ unlockId: ID, firstName: "Ana", unlockedAt, cta: { href: "/lugares" } });
    expect(view!.title).toBe(ACHIEVEMENTS.find((r) => r.id === "favoritou-5-lugares")!.title);
    expect(names.firstNameOf).toHaveBeenCalledWith("u1");
  });

  it("id inválido nem consulta; desbloqueio inexistente ou conquista removida do catálogo → null", async () => {
    const invalid = setup(null);
    expect(await invalid.useCase.execute("../etc")).toBeNull();
    expect(invalid.reader.findByUnlockId).not.toHaveBeenCalled();
    expect(await setup(null).useCase.execute(ID)).toBeNull();
    expect(await setup({ achievementId: "nao-existe-mais", userId: "u1", unlockedAt }).useCase.execute(ID)).toBeNull();
  });

  it("sem nome cadastrado, a página diz 'Alguém' (firstName null)", async () => {
    expect((await setup({ achievementId: "primeira-missao", userId: "u1", unlockedAt }, null).useCase.execute(ID))!.firstName).toBeNull();
  });
});

describe("convite e texto do post", () => {
  it("conquistas de lugares levam aos lugares; as demais, às missões", () => {
    expect(ctaFor("explorou-3-categorias").href).toBe("/lugares");
    expect(ctaFor("primeira-missao").href).toBe("/missoes");
    expect(ctaFor("nivel-3").href).toBe("/missoes");
  });

  it("texto curto em primeira pessoa", () => {
    expect(shareText("Primeira missão")).toBe('Desbloqueei a conquista "Primeira missão" explorando Joinville no LalaIA. Bora?');
  });
});
