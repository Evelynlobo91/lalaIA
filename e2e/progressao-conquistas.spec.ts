import { expect, test } from "@playwright/test";
import { addFavorite, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// #67 — Conquistas: desbloqueadas automaticamente por eventos de domínio e exibidas no perfil.
test.describe("conquistas no perfil", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("conta nova: todas bloqueadas, com a dica de como conseguir", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil");
    const galeria = page.getByRole("article", { name: "Conquistas" });
    await expect(galeria.getByText("0 de 5 desbloqueadas")).toBeVisible();
    const primeira = galeria.getByRole("listitem", { name: "Primeira missão: bloqueada" });
    await expect(primeira.getByText("Aceite uma missão e conclua todas as etapas.")).toBeVisible();
  });

  test("ao favoritar o 5º lugar, desbloqueia \"Colecionador de lugares\" e ganha o bônus de XP", async ({ page }) => {
    const sufixo = Date.now();
    const user = await createConfirmedUser();
    // 4 favoritos já existentes (direto no banco, sem evento) + o 5º pela tela, que publica FavoriteAdded.
    for (let i = 1; i <= 4; i++) await addFavorite(user, "place", await createTestPlace(`Café Conquista ${sufixo} ${i}`));
    const quinto = await createTestPlace(`Café Conquista ${sufixo} 5`);

    await loginAs(page, user, `/lugares/${quinto}`);
    await page.getByRole("button", { name: "Favoritar" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/perfil");
    const galeria = page.getByRole("article", { name: "Conquistas" });
    await expect(galeria.getByRole("listitem", { name: "Colecionador de lugares: desbloqueada" })).toBeVisible();
    await expect(galeria.getByText("1 de 5 desbloqueadas")).toBeVisible();
    await expect(page.getByRole("article", { name: "Seu XP" }).getByText("Conquista · Colecionador de lugares")).toBeVisible();
  });
});
