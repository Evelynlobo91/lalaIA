import { expect, test } from "@playwright/test";
import { createApprovedPartner } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("assinatura do parceiro (#153)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de assinatura roda só no celular");
  });

  test("parceiro vê o plano atual, assina o Pro e recebe o link de pagamento; o Pro só vale depois de pago", async ({ page }) => {
    const dono = await createConfirmedUser("Dona Assinante");
    await createApprovedPartner(dono, "Bar Assinante");
    await loginAs(page, dono, "/parceiro/inicio");

    await page.getByRole("navigation", { name: "Portal do parceiro" }).getByRole("link", { name: "Assinatura" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Assinatura" })).toBeVisible();

    // Sem assinatura, vale o plano padrão (Básico).
    const basico = page.getByRole("article", { name: "Plano Básico" });
    const pro = page.getByRole("article", { name: "Plano Pro" });
    await expect(basico.getByText("Seu plano", { exact: true })).toBeVisible();
    await expect(basico.getByRole("button")).toHaveCount(0);
    await expect(pro).toContainText("149,00");
    await expect(pro.getByRole("list", { name: "Recursos do plano Pro" })).toContainText("Destaque");

    // Assina o Pro: fatura gerada, com o link de pagamento.
    await pro.getByRole("button", { name: "Assinar o plano Pro" }).click();
    await expect(pro.getByText("Fatura do plano Pro gerada.")).toBeVisible();
    const pagar = pro.getByRole("link", { name: "Pagar agora" });
    await expect(pagar).toHaveAttribute("href", /^\/pagamento\/simulado\/fake_[0-9a-f]{24}$/);
    const href = await pagar.getAttribute("href");

    await pagar.click();
    await expect(page.getByRole("heading", { level: 1, name: "Pagamento simulado" })).toBeVisible();
    await expect(page.getByText("Este ambiente não cobra de verdade")).toBeVisible();

    // De volta: o Pro aguarda pagamento e o Básico continua valendo.
    await page.getByRole("link", { name: "Voltar para a assinatura" }).click();
    await expect(page.getByText("Aguardando o primeiro pagamento")).toBeVisible();
    await expect(pro.getByText("Aguardando pagamento", { exact: true })).toBeVisible();
    await expect(basico.getByText("Seu plano", { exact: true })).toBeVisible();

    // Pedir o pagamento de novo devolve a mesma cobrança (não gera outra fatura).
    await pro.getByRole("button", { name: "Ver pagamento do plano Pro" }).click();
    await expect(pro.getByRole("link", { name: "Pagar agora" })).toHaveAttribute("href", href!);
  });

  test("quem não é parceiro não chega à assinatura; a rota do ciclo fica desligada sem o segredo", async ({ page, request }) => {
    const pessoa = await createConfirmedUser();
    await loginAs(page, pessoa);
    await page.goto("/parceiro/assinatura");
    await expect(page).toHaveURL(/\/parceiro$/);

    expect((await page.goto("/pagamento/simulado/nao-e-uma-cobranca"))?.status()).toBe(404);
    // Sem CRON_SECRET no ambiente de teste, o ciclo não roda (nem com um cabeçalho qualquer).
    expect((await request.post("/api/billing/cycle", { headers: { authorization: "Bearer qualquer" } })).status()).toBe(503);
  });
});
