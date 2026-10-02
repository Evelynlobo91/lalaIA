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

test.describe("pagamento confirmado por webhook (#154)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de pagamento roda só no celular");
  });

  test("parceiro assina o Pro, o pagamento é confirmado e o plano passa a valer", async ({ page }) => {
    const dono = await createConfirmedUser("Dona Pagante");
    await createApprovedPartner(dono, "Bar Pagante");
    await loginAs(page, dono, "/parceiro/assinatura");

    const pro = page.getByRole("article", { name: "Plano Pro" });
    await pro.getByRole("button", { name: "Assinar o plano Pro" }).click();
    await pro.getByRole("link", { name: "Pagar agora" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pagamento simulado" })).toBeVisible();

    // O simulador entrega ao app o mesmo webhook assinado que o provedor entregaria.
    await page.getByRole("button", { name: "Simular pagamento" }).click();
    await expect(page.getByText("Pagamento simulado confirmado.")).toBeVisible();
    await page.getByRole("link", { name: "Ver minha assinatura" }).click();

    await expect(page.getByText("Em dia", { exact: true })).toBeVisible();
    await expect(pro.getByText("Seu plano", { exact: true })).toBeVisible();
    await expect(pro.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Plano Básico" }).getByText("Seu plano", { exact: true })).toHaveCount(0);
  });

  test("ninguém confirma a cobrança de outra conta pelo simulador", async ({ page, browser }) => {
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono, "Bar da Cobrança");
    await loginAs(page, dono, "/parceiro/assinatura");
    const pro = page.getByRole("article", { name: "Plano Pro" });
    await pro.getByRole("button", { name: "Assinar o plano Pro" }).click();
    const href = await pro.getByRole("link", { name: "Pagar agora" }).getAttribute("href");

    const outra = await createConfirmedUser();
    const context = await browser.newContext();
    const dela = await context.newPage();
    await loginAs(dela, outra);
    await dela.goto(href!);
    await dela.getByRole("button", { name: "Simular pagamento" }).click();
    await expect(dela.getByRole("alert")).toBeVisible();
    await expect(dela.getByText("Pagamento simulado confirmado.")).toHaveCount(0);
    await context.close();

    await page.reload();
    await expect(pro.getByText("Aguardando pagamento", { exact: true })).toBeVisible();
  });

  test("a rota de webhooks recusa o que não vem assinado e aceita cobrança desconhecida sem erro", async ({ request }) => {
    const { createHmac } = await import("node:crypto");
    const secret = process.env.BILLING_FAKE_WEBHOOK_SECRET!;
    const body = JSON.stringify({ id: `evt_e2e_${Date.now()}`, type: "invoice.paid", invoiceId: "fake_000000000000000000000000", occurredAt: new Date().toISOString() });
    const t = String(Math.floor(Date.now() / 1000));
    const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
    const post = (headers: Record<string, string>, data = body) => request.post("/api/billing/webhooks", { headers: { "content-type": "application/json", ...headers }, data });

    expect((await post({})).status()).toBe(401);
    expect((await post({ "x-billing-signature": `t=${t},v1=${"0".repeat(64)}` })).status()).toBe(401);
    expect((await post({ "x-billing-signature": signature }, body.replace("invoice.paid", "invoice.refunded"))).status()).toBe(401);

    const accepted = await post({ "x-billing-signature": signature });
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toMatchObject({ received: 1, unknown: 1, applied: 0 });
    // Reenvio do mesmo evento: duplicata, sem efeito.
    expect(await (await post({ "x-billing-signature": signature })).json()).toMatchObject({ duplicate: 1, unknown: 0 });
  });
});
