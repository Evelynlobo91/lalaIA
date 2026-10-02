import { expect, test } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("CRM: converter lead em parceiro (#150)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conversão roda só no celular");
  });

  test("comercial gera o convite → contato aceita → vira parceiro aprovado e o lead fica ativo", async ({ page, browser }) => {
    const unico = `Convertido ${Date.now()}`;
    const comercial = await createConfirmedUser("Comercial Conversão");
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads/novo");

    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("Paula Reis");
    await page.getByLabel("Telefone do contato").fill("(47) 98888-1212");
    await page.locator('select[name="source"]').selectOption("visita");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await page.getByRole("list", { name: "Leads" }).getByRole("link", { name: unico }).click();

    // Gera o convite: o telefone do lead já vem preenchido.
    const converter = page.getByRole("form", { name: "Converter em parceiro" });
    await expect(converter.getByLabel("Telefone do negócio")).toHaveValue("47988881212");
    await converter.getByLabel("Descrição do negócio").fill("Bar com música ao vivo e petiscos no centro de Joinville.");
    await converter.getByRole("button", { name: "Gerar link de convite" }).click();
    await expect(page.getByText("Convite gerado.")).toBeVisible();
    const link = await page.getByLabel("Link do convite").inputValue();
    expect(link).toMatch(/\/parceiro\/convite\/[A-Za-z0-9_-]{43}$/);

    // A pessoa de contato abre o link sem estar logada: entra e volta para o convite.
    const contato = await createConfirmedUser("Paula Reis");
    const context = await browser.newContext();
    const dela = await context.newPage();
    const caminho = new URL(link).pathname;
    await dela.goto(caminho);
    await expect(dela).toHaveURL(/\/entrar\?next=/);
    await dela.getByLabel("E-mail").fill(contato.email);
    await dela.getByLabel("Senha", { exact: true }).fill(contato.password);
    await dela.getByRole("button", { name: "Entrar" }).click();
    await expect(dela.getByRole("heading", { level: 1, name: "Convite de parceiro" })).toBeVisible();
    await expect(dela.getByText(contato.email)).toBeVisible();

    await dela.getByRole("button", { name: `Aceitar e abrir o portal de ${unico}` }).click();
    await expect(dela).toHaveURL(/\/parceiro\/inicio$/);
    await expect(dela.getByText(unico)).toBeVisible();

    // O link não serve para outra conta.
    const outra = await createConfirmedUser("Outra Pessoa");
    const outroContexto = await browser.newContext();
    const outraPagina = await outroContexto.newPage();
    await loginAs(outraPagina, outra);
    await outraPagina.goto(caminho);
    await expect(outraPagina.getByText("Este convite já foi usado.")).toBeVisible();
    await expect(outraPagina.getByRole("button", { name: /Aceitar/ })).toHaveCount(0);
    await outroContexto.close();
    await context.close();

    // No CRM: lead ativo, com a conversão no histórico e sem a seção de converter.
    await page.reload();
    await expect(page.getByText("Parceiro ativo", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Histórico de etapas" }).getByRole("listitem").first()).toContainText("Lead → Parceiro ativo");
    await expect(page.getByRole("form", { name: "Converter em parceiro" })).toHaveCount(0);
    await expect(page.getByText("Este lead já virou parceiro ativo.")).toBeVisible();
  });

  test("link inexistente ou malformado responde 404", async ({ page }) => {
    const pessoa = await createConfirmedUser();
    await loginAs(page, pessoa);
    expect((await page.goto(`/parceiro/convite/${"A".repeat(43)}`))?.status()).toBe(404);
    expect((await page.goto("/parceiro/convite/nao-e-um-token"))?.status()).toBe(404);
  });
});
