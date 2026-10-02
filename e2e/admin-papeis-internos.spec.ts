import { expect, test, type Page } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

const todas = ["/admin/usuarios", "/admin/parceiros", "/admin/conteudo", "/admin/leads", "/admin/financeiro", "/admin/metricas", "/admin/auditoria"];

/** Confere o menu e o que cada rota responde para um papel. */
async function confereAcesso(page: Page, secoes: string[], permitidas: string[]) {
  const nav = page.getByRole("navigation", { name: "Backoffice" });
  await expect(nav.getByRole("link")).toHaveText(["Início", ...secoes]);
  await expect(page.getByRole("list", { name: "Seções do backoffice" }).getByRole("listitem")).toHaveCount(secoes.length);
  for (const rota of todas) {
    const status = (await page.goto(rota))?.status();
    expect(status, rota).toBe(permitidas.includes(rota) ? 200 : 404);
  }
}

test.describe("papéis internos por capacidade (#157)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra de acesso não depende da largura da tela");
  });

  test("moderação: usuários, parceiros e conteúdo; sem leads, financeiro, métricas nem auditoria", async ({ page }) => {
    const pessoa = await createConfirmedUser("Pessoa da Moderação");
    await grantRole(pessoa, "moderator");
    await loginAs(page, pessoa, "/admin");
    await confereAcesso(page, ["Usuários", "Parceiros", "Conteúdo"], ["/admin/usuarios", "/admin/parceiros", "/admin/conteudo"]);

    // Vê os usuários, mas não gerencia papéis.
    await page.goto("/admin/usuarios");
    await expect(page.getByRole("list", { name: "Usuários" })).toBeVisible();
    await expect(page.getByText(/^Papéis de /)).toHaveCount(0);
  });

  test("moderação suspende um parceiro (a RLS aceita a capacidade, não só o papel admin)", async ({ page }) => {
    const unico = `Moderado ${Date.now()}`;
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono, unico);
    const pessoa = await createConfirmedUser("Moderação em Ação");
    await grantRole(pessoa, "moderator");
    await loginAs(page, pessoa, "/admin/parceiros");

    const card = page.getByRole("article", { name: `Parceiro ${unico}` });
    await card.getByRole("button", { name: "Suspender" }).click();
    await card.getByLabel("Motivo da suspensão (o parceiro vai ver)").fill("Suspenso pela moderação no teste.");
    await card.getByRole("button", { name: "Confirmar suspensão" }).click();
    await expect(card.getByText("Suspenso", { exact: true })).toBeVisible();
  });

  test("comercial só vê leads; financeiro só vê o financeiro", async ({ page, browser }) => {
    const comercial = await createConfirmedUser("Pessoa do Comercial");
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin");
    await confereAcesso(page, ["Leads"], ["/admin/leads"]);

    const financeiro = await createConfirmedUser("Pessoa do Financeiro");
    await grantRole(financeiro, "finance");
    const context = await browser.newContext();
    const outra = await context.newPage();
    await loginAs(outra, financeiro, "/admin");
    await confereAcesso(outra, ["Financeiro"], ["/admin/financeiro"]);
    await context.close();
  });

  test("admin busca uma pessoa, concede o papel de financeiro e ela passa a entrar no backoffice", async ({ page, browser }) => {
    const nome = `Nova Financeira ${Date.now()}`;
    const pessoa = await createConfirmedUser(nome);
    const admin = await createConfirmedUser("Admin dos Papéis");
    await grantRole(admin, "admin");

    // Antes: a área não existe para ela.
    const context = await browser.newContext();
    const dela = await context.newPage();
    await loginAs(dela, pessoa);
    expect((await dela.goto("/admin"))?.status()).toBe(404);

    await loginAs(page, admin, "/admin/usuarios");
    await page.getByLabel("Buscar por nome ou e-mail").fill(nome);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios\?q=/);
    const linha = page.getByRole("list", { name: "Usuários" }).getByRole("listitem").filter({ hasText: pessoa.email });
    await linha.getByText(`Papéis de ${nome}`).click();
    const form = linha.getByRole("form", { name: `Papéis de ${nome}` });
    await form.getByRole("checkbox", { name: /Financeiro/ }).check();
    await form.getByRole("button", { name: "Salvar papéis" }).click();
    await expect(form.getByText("Papéis atualizados.")).toBeVisible();
    await expect(linha.getByText("Financeiro", { exact: true }).first()).toBeVisible();

    // Depois: entra, e só no financeiro. Vale na hora, sem novo login.
    expect((await dela.goto("/admin"))?.status()).toBe(200);
    await expect(dela.getByRole("navigation", { name: "Backoffice" }).getByRole("link")).toHaveText(["Início", "Financeiro"]);
    expect((await dela.goto("/admin/usuarios"))?.status()).toBe(404);
    await context.close();

    // A mudança fica na trilha de auditoria.
    await page.goto("/admin/auditoria");
    await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Admin dos Papéis" }).filter({ hasText: "Concedeu um papel interno" }).first()).toBeVisible();
  });
});
