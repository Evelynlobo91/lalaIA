import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("financeiro: recebimentos, MRR e faturas (#156)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "painel financeiro roda só no celular");
  });

  test("parceiro paga o Pro e outro fica devendo: o financeiro vê o recebimento e as faturas por situação", async ({ page, browser }) => {
    const pagante = `Pagante ${Date.now()}`;
    const devedor = `Em Aberto ${Date.now()}`;

    // Dois parceiros assinam o Pro; só o primeiro paga.
    for (const [nome, paga] of [[pagante, true], [devedor, false]] as const) {
      const dono = await createConfirmedUser(nome);
      await createApprovedPartner(dono, `Bar ${nome}`);
      const context = await browser.newContext();
      const dele = await context.newPage();
      await loginAs(dele, dono, "/parceiro/assinatura");
      const pro = dele.getByRole("article", { name: "Plano Pro" });
      await pro.getByRole("button", { name: "Fazer upgrade para o plano Pro" }).click();
      await expect(pro.getByText("Fatura do plano Pro gerada.")).toBeVisible();
      if (paga) {
        await pro.getByRole("link", { name: "Pagar agora" }).click();
        await dele.getByRole("button", { name: "Simular pagamento" }).click();
        await expect(dele.getByText("Pagamento simulado confirmado.")).toBeVisible();
      }
      await context.close();
    }

    const financeiro = await createConfirmedUser("Pessoa do Financeiro");
    await grantRole(financeiro, "finance");
    await loginAs(page, financeiro, "/admin/financeiro");

    // Números: há pelo menos o recebimento e a mensalidade do parceiro que pagou.
    const numeros = page.getByRole("list", { name: "Números do financeiro" }).getByRole("listitem");
    await expect(numeros).toHaveCount(4);
    await expect(numeros.filter({ hasText: "Recebido em 30 dias" })).toContainText("R$");
    await expect(numeros.filter({ hasText: "MRR" })).toContainText("R$");
    await expect(page.getByLabel("Assinaturas por situação")).toContainText("em dia");

    // Faturas pagas: aparece só quem pagou.
    const situacao = page.getByRole("navigation", { name: "Situação da fatura" });
    await situacao.getByRole("link", { name: "Pagas" }).click();
    await expect(page).toHaveURL(/faturas=paid/);
    await expect(situacao.getByRole("link", { name: "Pagas" })).toHaveAttribute("aria-current", "page");
    const tabela = page.getByRole("table");
    const linhaPaga = tabela.getByRole("row").filter({ hasText: pagante });
    await expect(linhaPaga).toHaveCount(1);
    await expect(linhaPaga).toContainText("Pro");
    await expect(linhaPaga).toContainText("149,00");
    await expect(linhaPaga.getByText("Paga", { exact: true })).toBeVisible();
    await expect(tabela.getByRole("row").filter({ hasText: devedor })).toHaveCount(0);

    // Em aberto: aparece quem ainda não pagou. O período escolhido é mantido ao trocar o filtro.
    await page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: "90 dias" }).click();
    await expect(page).toHaveURL(/periodo=90&faturas=paid/);
    await situacao.getByRole("link", { name: "Em aberto" }).click();
    await expect(page).toHaveURL(/periodo=90&faturas=pending/);
    await expect(tabela.getByRole("row").filter({ hasText: devedor })).toHaveCount(1);
    await expect(tabela.getByRole("row").filter({ hasText: pagante })).toHaveCount(0);

    // Os planos continuam na mesma página.
    await expect(page.getByRole("article", { name: "Plano Básico" })).toBeVisible();
  });

  test("comercial não vê o painel financeiro (404)", async ({ page }) => {
    const comercial = await createConfirmedUser();
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin");
    expect((await page.goto("/admin/financeiro?faturas=paid"))?.status()).toBe(404);
  });
});
