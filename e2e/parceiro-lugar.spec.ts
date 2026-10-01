import { expect, test, type Browser, type Page } from "@playwright/test";
import { createApprovedPartner, createTestPlace, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser, type TestUser } from "./support/users";

async function sessao(browser: Browser, user: TestUser, next: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, user, next);
  return page;
}

test.describe("reivindicar e editar o próprio lugar (#28)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("parceiro reivindica → admin aprova → parceiro edita → página pública atualizada", async ({ page, browser }) => {
    const unico = `Café E2E ${Date.now()}`;
    const placeId = await createTestPlace(unico);
    const dono = await createConfirmedUser("Dona do Café");
    await createApprovedPartner(dono, "Café Ltda");

    // 1. Parceiro busca e reivindica.
    await loginAs(page, dono, "/parceiro/lugares");
    await page.getByLabel("Nome do lugar").fill(unico);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: `Reivindicar ${unico}` }).click();
    await expect(page.getByText("Pedido enviado")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("list", { name: "Seus pedidos de vínculo" }).getByText("Em análise")).toBeVisible();

    // 2. Admin aprova o vínculo.
    const admin = await createConfirmedUser("Admin");
    await grantRole(admin, "admin");
    const adminPage = await sessao(browser, admin, "/admin/parceiros");
    const pedido = adminPage.getByRole("article", { name: `Vínculo: Café Ltda → ${unico}` });
    await pedido.getByRole("button", { name: "Aprovar vínculo" }).click();
    await expect(pedido).toHaveCount(0);

    // 3. Parceiro vê o lugar e edita nome e horário.
    await page.goto("/parceiro/lugares");
    await page.getByRole("list", { name: "Lugares que você administra" }).getByRole("link", { name: new RegExp(unico) }).click();
    await expect(page).toHaveURL(new RegExp(`/parceiro/lugares/${placeId}/editar$`));
    const novoNome = `${unico} (oficial)`;
    await page.getByLabel("Nome").fill(novoNome);
    await page.getByLabel("Sábado", { exact: true }).check();
    await page.getByLabel("Sábado: abre").fill("10:00");
    await page.getByLabel("Sábado: fecha").fill("16:00");
    await page.getByLabel("Site").fill("cafe-e2e.com.br");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Dados atualizados.")).toBeVisible();

    // 4. A página pública mostra os dados do parceiro.
    await page.goto(`/lugares/${placeId}`);
    await expect(page.getByRole("heading", { level: 1, name: novoNome })).toBeVisible();
    const horario = page.getByRole("region", { name: "Horário de funcionamento" });
    await expect(horario.getByText("10:00–16:00")).toBeVisible();
    await expect(page.getByRole("region", { name: "Site" }).getByRole("link")).toHaveAttribute("href", "https://cafe-e2e.com.br/");
  });

  test("lugar com responsável não pode ser reivindicado por outro; edição alheia é 404", async ({ page, browser }) => {
    const unico = `Bar E2E ${Date.now()}`;
    const placeId = await createTestPlace(unico);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono, "Bar do Dono");
    const admin = await createConfirmedUser();
    await grantRole(admin, "admin");

    const donoPage = await sessao(browser, dono, `/parceiro/lugares?q=${encodeURIComponent(unico)}`);
    await donoPage.getByRole("button", { name: `Reivindicar ${unico}` }).click();
    await expect(donoPage.getByText("Pedido enviado")).toBeVisible();
    const adminPage = await sessao(browser, admin, "/admin/parceiros");
    await adminPage.getByRole("article", { name: `Vínculo: Bar do Dono → ${unico}` }).getByRole("button", { name: "Aprovar vínculo" }).click();
    await expect(adminPage.getByRole("article", { name: `Vínculo: Bar do Dono → ${unico}` })).toHaveCount(0);

    const outro = await createConfirmedUser();
    await createApprovedPartner(outro, "Outro Bar");
    await loginAs(page, outro, `/parceiro/lugares?q=${encodeURIComponent(unico)}`);
    const resultado = page.getByRole("list", { name: "Resultados da busca" }).getByRole("listitem").filter({ hasText: unico });
    await expect(resultado.getByText("Já tem responsável")).toBeVisible();
    await expect(resultado.getByRole("button", { name: /Reivindicar/ })).toHaveCount(0);

    expect((await page.goto(`/parceiro/lugares/${placeId}/editar`))?.status()).toBe(404);
  });
});
