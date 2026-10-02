import { expect, test, type Page } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

async function cadastrar(page: Page, nome: string, origem: string) {
  await page.goto("/admin/leads/novo");
  await page.getByLabel("Estabelecimento").fill(nome);
  await page.getByLabel("Nome do contato").fill("Contato Teste");
  await page.getByLabel("Telefone do contato").fill("47966665555");
  await page.locator('select[name="source"]').selectOption(origem);
  await page.getByRole("button", { name: "Cadastrar lead" }).click();
  await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
}

test.describe("CRM: filtros e conversão por origem (#151)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "filtros não dependem da largura da tela");
  });

  test("filtra por origem e responsável, mantém o filtro ao ir para o funil e limpa", async ({ page }) => {
    const tag = `Filtro ${Date.now()}`;
    const nome = `Comercial Filtros ${Date.now()}`;
    const comercial = await createConfirmedUser(nome);
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads");
    await cadastrar(page, `${tag} Insta`, "instagram");
    await cadastrar(page, `${tag} Visita`, "visita");

    const lista = page.getByRole("list", { name: "Leads" });
    const filtros = page.getByRole("form", { name: "Filtros" });

    // Origem + responsável (só os leads desta pessoa, que acabou de ser criada).
    await filtros.locator('select[name="origem"]').selectOption("visita");
    await filtros.locator('select[name="responsavel"]').selectOption({ label: nome });
    await filtros.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/origem=visita/);
    await expect(page).toHaveURL(/responsavel=[0-9a-f-]{36}/);
    await expect(lista.getByRole("listitem")).toHaveCount(1);
    await expect(lista).toContainText(`${tag} Visita`);

    // O funil recebe o mesmo filtro.
    await page.getByRole("link", { name: "Ver funil" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/funil\?origem=visita&responsavel=/);
    await expect(page.getByRole("article", { name: `${tag} Visita` })).toBeVisible();
    await expect(page.getByRole("article", { name: `${tag} Insta` })).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Filtros" }).locator('select[name="origem"]')).toHaveValue("visita");

    // Etapa sem nenhum lead: mensagem própria. Limpar volta a mostrar os dois.
    await page.goto("/admin/leads?etapa=perdido&responsavel=" + new URL(page.url()).searchParams.get("responsavel"));
    await expect(page.getByText("Nenhum lead com estes filtros.")).toBeVisible();
    await page.getByRole("link", { name: "Limpar" }).click();
    await expect(page).toHaveURL(/\/admin\/leads$/);
    await expect(lista).toContainText(`${tag} Insta`);
    await expect(lista).toContainText(`${tag} Visita`);
  });

  test("relatório de conversão mostra todas as origens, o total e troca de período", async ({ page }) => {
    const comercial = await createConfirmedUser("Comercial Relatório");
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads");
    await cadastrar(page, `Relatório ${Date.now()}`, "indicacao");

    await page.getByRole("link", { name: "Conversão por origem" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Conversão por origem" })).toBeVisible();
    const tabela = page.getByRole("table");
    await expect(tabela.getByRole("rowheader")).toHaveText(["Instagram", "Indicação", "Visita", "Outro", "Todas as origens"]);
    await expect(tabela.getByRole("columnheader")).toHaveText(["Origem", "Leads", "Em aberto", "Perdidos", "Parceiros ativos", "Conversão"]);
    // Há pelo menos o lead que acabou de entrar por indicação.
    const indicacao = tabela.getByRole("row").filter({ hasText: "Indicação" }).getByRole("cell");
    expect(Number((await indicacao.first().textContent())?.replace(/\D/g, ""))).toBeGreaterThanOrEqual(1);

    const periodo = page.getByRole("navigation", { name: "Período" });
    await expect(periodo.getByRole("link", { name: "Todo o período" })).toHaveAttribute("aria-current", "page");
    await periodo.getByRole("link", { name: "30 dias" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/conversao\?periodo=30$/);
    await expect(periodo.getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "page");
  });

  test("quem não cuida de leads não vê o relatório (404)", async ({ page }) => {
    const financeiro = await createConfirmedUser();
    await grantRole(financeiro, "finance");
    await loginAs(page, financeiro, "/admin");
    expect((await page.goto("/admin/leads/conversao"))?.status()).toBe(404);
  });
});
