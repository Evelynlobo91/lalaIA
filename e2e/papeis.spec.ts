import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("papéis e autorização (RNF05)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("usuário comum: /admin não existe para ele (404) e o portal do parceiro é restrito", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user);

    const admin = await page.goto("/admin");
    expect(admin?.status()).toBe(404);

    await page.goto("/parceiro");
    await expect(page.getByRole("heading", { level: 1, name: "Seja parceiro do LalaIA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar para análise" })).toBeVisible();

    await page.goto("/perfil");
    await expect(page.getByRole("link", { name: "Portal do parceiro" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Moderação" })).toHaveCount(0);
  });

  test("parceiro acessa o portal e vê o atalho no perfil", async ({ page }) => {
    const user = await createConfirmedUser("Bar do Parceiro");
    await createApprovedPartner(user, "Bar do Parceiro Ltda");
    await loginAs(page, user);

    await page.goto("/perfil");
    await page.getByRole("link", { name: "Portal do parceiro" }).click();
    await expect(page).toHaveURL(/\/parceiro\/inicio$/);
    await expect(page.getByRole("heading", { name: "Olá, Bar do Parceiro!" })).toBeVisible();

    expect((await page.goto("/admin"))?.status()).toBe(404);
  });

  test("admin acessa a moderação e vê usuários com papéis", async ({ page }) => {
    const parceiro = await createConfirmedUser("Parceiro Listado");
    await grantRole(parceiro, "partner");
    const admin = await createConfirmedUser("Admin E2E");
    await grantRole(admin, "admin");
    await loginAs(page, admin);

    await page.goto("/perfil");
    await page.getByRole("link", { name: "Moderação" }).click();
    await expect(page.getByRole("heading", { name: "Moderação" })).toBeVisible();

    const linha = page.getByRole("list", { name: "Usuários" }).getByRole("listitem").filter({ hasText: parceiro.email });
    await expect(linha.getByText("Parceiro", { exact: true })).toBeVisible();
  });

  test("sem login, áreas restritas levam para entrar", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fadmin$/);
    await page.goto("/parceiro");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fparceiro$/);
  });
});
