import { expect, test, type Browser, type Page } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser, type TestUser } from "./support/users";

async function novaSessao(browser: Browser, user: TestUser, next = "/"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, user, next);
  return page;
}

async function preencherCadastro(page: Page, negocio: string) {
  await page.getByLabel("Estabelecimento").check();
  await page.getByLabel("Nome do negócio").fill(negocio);
  await page.getByLabel("Telefone com DDD").fill("(47) 99999-0000");
  await page.getByLabel("Instagram (opcional)").fill("@bar_teste");
  await page.getByLabel(/Conte sobre o seu negócio/).fill("Bar com música ao vivo no centro de Joinville.");
}

test.describe("cadastro de parceiro com aprovação (#26)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("valida o formulário (CNPJ e telefone)", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/parceiro");

    await preencherCadastro(page, "Bar Validado");
    await page.getByLabel("Telefone com DDD").fill("9999");
    await page.getByLabel("CNPJ (opcional)").fill("11.222.333/0001-82");
    await page.getByRole("button", { name: "Enviar para análise" }).click();

    await expect(page.getByText("Informe um telefone com DDD.")).toBeVisible();
    await expect(page.getByText("CNPJ inválido.")).toBeVisible();
    await expect(page.getByLabel("Nome do negócio")).toHaveValue("Bar Validado");
  });

  test("pedido → em análise → admin aprova → portal liberado", async ({ page, browser }) => {
    const user = await createConfirmedUser("Dona do Bar");
    const negocio = `Bar Aprovado ${Date.now()}`;
    await loginAs(page, user, "/parceiro");

    await preencherCadastro(page, negocio);
    await page.getByRole("button", { name: "Enviar para análise" }).click();
    await expect(page.getByText("Cadastro em análise")).toBeVisible();

    const admin = await createConfirmedUser("Admin Revisor");
    await grantRole(admin, "admin");
    const adminPage = await novaSessao(browser, admin, "/admin/parceiros");
    const card = adminPage.getByRole("article", { name: `Cadastro de ${negocio}` });
    await expect(card.getByText(user.email)).toBeVisible();
    await card.getByRole("button", { name: "Aprovar" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Olá, Dona do Bar!" })).toBeVisible();
    await page.goto("/perfil");
    await expect(page.getByRole("link", { name: "Portal do parceiro" })).toBeVisible();
  });

  test("admin recusa com motivo → pessoa vê o motivo, corrige e reenvia", async ({ page, browser }) => {
    const user = await createConfirmedUser();
    const negocio = `Bar Recusado ${Date.now()}`;
    await loginAs(page, user, "/parceiro");
    await preencherCadastro(page, negocio);
    await page.getByRole("button", { name: "Enviar para análise" }).click();
    await expect(page.getByText("Cadastro em análise")).toBeVisible();

    const admin = await createConfirmedUser();
    await grantRole(admin, "admin");
    const adminPage = await novaSessao(browser, admin, "/admin/parceiros");
    const card = adminPage.getByRole("article", { name: `Cadastro de ${negocio}` });
    await card.getByRole("button", { name: "Recusar" }).click();
    await card.getByLabel(/Motivo da recusa/).fill("Instagram não encontrado.");
    await card.getByRole("button", { name: "Confirmar recusa" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Motivo: Instagram não encontrado.")).toBeVisible();
    await expect(page.getByLabel("Nome do negócio")).toHaveValue(negocio);
    await page.getByLabel("Instagram (opcional)").fill("@bar_correto");
    await page.getByRole("button", { name: "Enviar de novo" }).click();
    await expect(page.getByText("Cadastro em análise")).toBeVisible();
  });

  test("quem não é admin não acessa a fila de revisão (404)", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user);
    expect((await page.goto("/admin/parceiros"))?.status()).toBe(404);
  });
});
