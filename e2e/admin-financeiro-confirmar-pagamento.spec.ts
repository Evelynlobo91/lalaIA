import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("financeiro: confirmar pagamento manualmente", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo do financeiro roda só no celular");
  });

  test("o financeiro confirma a fatura em aberto, o Pro do parceiro passa a valer e a ação fica na auditoria", async ({ page, browser }) => {
    const nome = `Bar Cortesia ${Date.now()}`;
    const dono = await createConfirmedUser(nome);
    await createApprovedPartner(dono, nome);

    // O parceiro assina o Pro, mas não paga: continua no Básico.
    await loginAs(page, dono, "/parceiro/assinatura");
    const pro = page.getByRole("article", { name: "Plano Pro" });
    await pro.getByRole("button", { name: "Fazer upgrade para o plano Pro" }).click();
    await expect(pro.getByRole("link", { name: "Pagar agora" })).toBeVisible();
    await expect(pro.getByText("Seu plano", { exact: true })).toHaveCount(0);

    // Quem só lê o financeiro não vê o botão; quem tem billing:write confirma (com um passo de confirmação).
    const financeiro = await createConfirmedUser(`Financeiro ${Date.now()}`);
    await grantRole(financeiro, "finance");
    const context = await browser.newContext();
    const admin = await context.newPage();
    await loginAs(admin, financeiro, "/admin/financeiro?faturas=pending");
    const linha = admin.getByRole("row").filter({ hasText: nome });
    await expect(linha).toContainText("R$ 149,00");
    await linha.getByRole("button", { name: `Confirmar o pagamento de ${nome}` }).click();
    await expect(linha).toContainText(`Recebeu R$ 149,00 de ${nome}?`);
    await linha.getByRole("button", { name: "Sim, confirmar" }).click();
    await expect(admin.getByRole("row").filter({ hasText: nome })).toHaveCount(0);
    await admin.goto("/admin/financeiro?faturas=paid");
    const paga = admin.getByRole("row").filter({ hasText: nome });
    await expect(paga).toContainText("Paga");
    await expect(paga.getByRole("button")).toHaveCount(0);
    await context.close();

    // Para o parceiro, o Pro passou a valer.
    await page.reload();
    await expect(page.getByRole("article", { name: "Plano atual" }).getByText("Em dia", { exact: true })).toBeVisible();
    await expect(pro.getByText("Seu plano", { exact: true })).toBeVisible();

    // Auditoria: quem confirmou.
    const auditor = await createConfirmedUser("Admin do Financeiro");
    await grantRole(auditor, "admin");
    const auditContext = await browser.newContext();
    const auditoria = await auditContext.newPage();
    await loginAs(auditoria, auditor, "/admin/auditoria");
    await expect(auditoria.getByRole("table").getByRole("row").filter({ hasText: "Financeiro" }).filter({ hasText: "Confirmou pagamento manualmente" }).first()).toBeVisible();
    await auditContext.close();
  });
});
