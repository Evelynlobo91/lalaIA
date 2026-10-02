import { expect, test } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("CRM: cadastro de lead (#147)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de cadastro roda só no celular");
  });

  test("comercial cadastra um lead, que aparece na lista, e depois edita", async ({ page }) => {
    const unico = `Bar Lead ${Date.now()}`;
    const nome = `Comercial ${Date.now()}`;
    const comercial = await createConfirmedUser(nome);
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads");
    await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();

    await page.getByRole("link", { name: "Novo lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/novo$/);
    // Quem cadastra já vem como responsável.
    await expect(page.locator('select[name="ownerId"]')).toHaveValue(/[0-9a-f-]{36}/);

    // Sem telefone nem e-mail: recusa e mantém o que foi digitado.
    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("Maria da Silva");
    await page.locator('select[name="source"]').selectOption("instagram");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page.getByText("Informe um telefone ou um e-mail do contato.")).toBeVisible();
    await expect(page.getByLabel("Estabelecimento")).toHaveValue(unico);

    await page.getByLabel("Telefone do contato").fill("(47) 99999-1234");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await expect(page.getByText("Lead salvo.")).toBeVisible();

    const linha = page.getByRole("list", { name: "Leads" }).getByRole("listitem").filter({ hasText: unico });
    await expect(linha).toContainText("Maria da Silva");
    await expect(linha).toContainText("Instagram");
    await expect(linha).toContainText(`Responsável: ${nome}`);
    await expect(linha.getByText("Lead", { exact: true })).toBeVisible();

    // Edição.
    await linha.getByRole("link", { name: unico }).click();
    await expect(page.getByRole("heading", { level: 1, name: unico })).toBeVisible();
    await expect(page.getByLabel("Telefone do contato")).toHaveValue("47999991234");
    await page.getByLabel("Nome do contato").fill("Maria Souza");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await expect(page.getByRole("list", { name: "Leads" }).getByRole("listitem").filter({ hasText: unico })).toContainText("Maria Souza");
  });

  test("moderação e financeiro não acessam leads (404); id inexistente também é 404", async ({ page }) => {
    const moderador = await createConfirmedUser();
    await grantRole(moderador, "moderator");
    await loginAs(page, moderador, "/admin");
    for (const rota of ["/admin/leads", "/admin/leads/novo"]) expect((await page.goto(rota))?.status(), rota).toBe(404);

    await page.context().clearCookies();
    const comercial = await createConfirmedUser();
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads");
    expect((await page.goto("/admin/leads/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
    expect((await page.goto("/admin/leads/nao-e-um-id"))?.status()).toBe(404);
  });
});
