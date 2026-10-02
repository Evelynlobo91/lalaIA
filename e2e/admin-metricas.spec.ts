import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("backoffice: métricas gerais (#145)", () => {
  test("admin vê os números do período, troca o período e abre a tabela", async ({ page }, testInfo) => {
    const admin = await createConfirmedUser("Admin das Métricas");
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin/metricas");
    await expect(page.getByRole("heading", { level: 1, name: "Métricas" })).toBeVisible();

    // Padrão: 30 dias, com as cinco métricas. A conta do próprio admin acabou de ser criada: há pelo menos 1 novo usuário.
    const periodo = page.getByRole("navigation", { name: "Período" });
    await expect(periodo.getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "page");
    const numeros = page.getByRole("list", { name: "Números dos últimos 30 dias" }).getByRole("listitem");
    await expect(numeros).toHaveCount(5);
    for (const rotulo of ["Novos usuários", "Parceiros aprovados", "Eventos publicados", "Missões concluídas", "Lives transmitidas"]) {
      await expect(numeros.filter({ hasText: rotulo })).toHaveCount(1);
    }
    await expect(numeros.filter({ hasText: "Novos usuários" })).toContainText("usuários no total");
    await expect(numeros.filter({ hasText: "Novos usuários" })).toContainText("vs. 30 dias anteriores");

    // Troca de período pela URL (compartilhável).
    await periodo.getByRole("link", { name: "7 dias" }).click();
    await expect(page).toHaveURL(/\/admin\/metricas\?periodo=7$/);
    await expect(periodo.getByRole("link", { name: "7 dias" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("list", { name: "Números dos últimos 7 dias" })).toBeVisible();

    // A mesma informação em tabela.
    await page.getByText("Ver em tabela").click();
    const tabela = page.getByRole("table");
    await expect(tabela.getByRole("columnheader", { name: "Últimos 7 dias" })).toBeVisible();
    await expect(tabela.getByRole("rowheader")).toHaveCount(5);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, testInfo.project.name).toBeLessThanOrEqual(0);
  });

  test("período inválido cai em 30 dias; quem não é admin não acessa (404)", async ({ page }) => {
    const admin = await createConfirmedUser();
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin");
    await page.goto("/admin/metricas?periodo=15");
    await expect(page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "page");

    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    await page.context().clearCookies();
    await loginAs(page, parceiro);
    expect((await page.goto("/admin/metricas"))?.status()).toBe(404);
  });
});
