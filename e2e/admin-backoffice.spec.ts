import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

const secoes = ["Usuários", "Parceiros", "Conteúdo", "Leads", "Financeiro", "Métricas", "Auditoria", "Início"];
const rotas = ["/admin", "/admin/usuarios", "/admin/parceiros", "/admin/conteudo", "/admin/leads", "/admin/financeiro", "/admin/metricas", "/admin/auditoria"];

test.describe("backoffice (#141)", () => {
  test("admin entra no backoffice e navega pelas seções", async ({ page }, testInfo) => {
    const admin = await createConfirmedUser("Admin do Backoffice");
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Backoffice" })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Backoffice" });
    for (const secao of secoes) {
      await nav.getByRole("link", { name: secao }).click();
      await expect(nav.getByRole("link", { name: secao })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    // Sem rolagem horizontal da página (as abas rolam dentro da própria barra no celular).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, testInfo.project.name).toBeLessThanOrEqual(0);
  });

  test("a moderação de parceiros fica dentro do painel", async ({ page }) => {
    const admin = await createConfirmedUser("Admin Moderador");
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin");

    await page.getByRole("list", { name: "Seções do backoffice" }).getByRole("link", { name: /Parceiros/ }).click();
    await expect(page).toHaveURL(/\/admin\/parceiros$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cadastros de parceiros" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Backoffice" })).toBeVisible();
  });

  test("para quem não é admin, nenhuma rota do backoffice existe (404)", async ({ page }) => {
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    await loginAs(page, parceiro);
    for (const rota of rotas) expect((await page.goto(rota))?.status(), rota).toBe(404);
  });

  test("sem login, o backoffice pede para entrar", async ({ page }) => {
    await page.goto("/admin/financeiro");
    await expect(page).toHaveURL(/\/entrar\?next=/);
  });
});
