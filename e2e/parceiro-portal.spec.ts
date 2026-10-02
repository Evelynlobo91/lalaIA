import { expect, test } from "@playwright/test";
import { createApprovedPartner } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

const secoes = ["Meus lugares", "Eventos", "Live", "Missões", "Ofertas", "Dados", "Assinatura", "Início"];

test.describe("portal do parceiro (#27)", () => {
  test("parceiro aprovado entra no portal e navega pelas seções", async ({ page }, testInfo) => {
    const user = await createConfirmedUser("Dona do Café");
    await createApprovedPartner(user, "Café Teste");
    await loginAs(page, user, "/parceiro/inicio");
    await expect(page.getByText("Café Teste")).toBeVisible();

    // A entrada /parceiro leva o parceiro aprovado direto ao portal.
    await page.goto("/parceiro");
    await expect(page).toHaveURL(/\/parceiro\/inicio$/);

    const nav = page.getByRole("navigation", { name: "Portal do parceiro" });
    for (const secao of secoes) {
      await nav.getByRole("link", { name: secao }).click();
      await expect(nav.getByRole("link", { name: secao })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    // Sem rolagem horizontal da página (as abas rolam dentro da própria barra no celular).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, testInfo.project.name).toBeLessThanOrEqual(0);
  });

  test("quem não é parceiro é levado ao cadastro", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user);
    await page.goto("/parceiro/eventos");
    await expect(page).toHaveURL(/\/parceiro$/);
    await expect(page.getByRole("heading", { level: 1, name: "Seja parceiro do LalaIA" })).toBeVisible();
  });

  test("sem login, o portal pede para entrar", async ({ page }) => {
    await page.goto("/parceiro/eventos");
    await expect(page).toHaveURL(/\/entrar\?next=/);
  });
});
