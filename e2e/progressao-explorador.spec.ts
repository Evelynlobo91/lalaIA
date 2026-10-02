import { expect, test } from "@playwright/test";
import { addFavorite, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// #68 — Perfil de explorador: contagem do que a pessoa já descobriu, só para ela.
test.describe("perfil de explorador", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("conta nova: contadores zerados e convite para explorar", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil");
    const perfil = page.getByRole("article", { name: "Seu perfil de explorador" });
    await expect(perfil.getByText("Favorite lugares e eventos ou conclua missões")).toBeVisible();
    await expect(perfil.getByText("Lugares descobertos")).toBeVisible();
  });

  test("lugares favoritados contam por categoria; outra pessoa não vê", async ({ page, browser }) => {
    const sufixo = Date.now();
    const user = await createConfirmedUser();
    await addFavorite(user, "place", await createTestPlace(`Café Explorador ${sufixo} 1`));
    await addFavorite(user, "place", await createTestPlace(`Café Explorador ${sufixo} 2`));
    await addFavorite(user, "place", await createTestPlace(`Parque Explorador ${sufixo}`, undefined, "ar-livre"));

    await loginAs(page, user, "/perfil");
    const perfil = page.getByRole("article", { name: "Seu perfil de explorador" });
    const descobertos = perfil.getByText("Lugares descobertos").locator("..");
    await expect(descobertos.getByText("3", { exact: true })).toBeVisible();
    const categorias = perfil.getByRole("list", { name: "Descobertas por categoria" });
    await expect(categorias.getByRole("listitem").first()).toContainText("Cafés e docerias");
    await expect(categorias.getByRole("listitem").filter({ hasText: "Cafés e docerias" }).getByLabel("2 descobertas")).toBeVisible();
    await expect(categorias.getByRole("listitem").filter({ hasText: "Parques e ar livre" })).toBeVisible();

    // Outra conta vê só o próprio perfil (o id vem da sessão).
    const outra = await (await browser.newContext()).newPage();
    await loginAs(outra, await createConfirmedUser(), "/perfil");
    await expect(outra.getByRole("article", { name: "Seu perfil de explorador" }).getByRole("list", { name: "Descobertas por categoria" })).toHaveCount(0);
  });
});
