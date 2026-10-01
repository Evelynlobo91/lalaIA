import { expect, test } from "@playwright/test";
import { creditTestXp } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// #66 — Níveis de exploração: derivados do saldo de XP, com progresso até o próximo.
test.describe("níveis de exploração no perfil", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("sem XP: nível 1 e quanto falta para o 2", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil");
    const nivel = page.getByRole("article", { name: "Seu nível" });
    await expect(nivel.getByText("Nível 1", { exact: true })).toBeVisible();
    await expect(nivel.getByText("Recém-chegado na Rua das Palmeiras")).toBeVisible();
    await expect(nivel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(nivel.getByText(/Faltam 100 XP para o nível 2/)).toBeVisible();
  });

  test("com 175 XP: nível 2, metade do caminho e 75 XP faltando", async ({ page }) => {
    const user = await createConfirmedUser();
    await creditTestXp(user, 175);
    await loginAs(page, user, "/perfil");
    const nivel = page.getByRole("article", { name: "Seu nível" });
    await expect(nivel.getByText("Nível 2", { exact: true })).toBeVisible();
    await expect(nivel.getByText("Ciclista da Cidade das Bicicletas")).toBeVisible();
    await expect(nivel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await expect(nivel.getByText(/Faltam 75 XP para o nível 3/)).toBeVisible();
  });
});
