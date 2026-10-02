import { expect, test } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Hoje no calendário de Joinville, como o app calcula.
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

test.describe("CRM: anotações e follow-ups (#149)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo do lead roda só no celular");
  });

  test("comercial anota, define o próximo passo para hoje, vê na lista do dia e conclui", async ({ page }) => {
    const unico = `Follow ${Date.now()}`;
    const nome = `Comercial Follow ${Date.now()}`;
    const comercial = await createConfirmedUser(nome);
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads/novo");

    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("Carla Dias");
    await page.getByLabel("Telefone do contato").fill("47977776666");
    await page.locator('select[name="source"]').selectOption("indicacao");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await expect(page.getByRole("link", { name: "Meus follow-ups de hoje (0)" })).toBeVisible();

    await page.getByRole("list", { name: "Leads" }).getByRole("link", { name: unico }).click();
    await expect(page.getByRole("heading", { level: 1, name: unico })).toBeVisible();
    await expect(page.getByText("Nenhum próximo passo combinado.")).toBeVisible();

    // Anotação.
    const anotar = page.getByRole("form", { name: "Nova anotação" });
    await anotar.getByLabel("Nova anotação").fill("Ligou e pediu uma proposta por e-mail.");
    await anotar.getByRole("button", { name: "Anotar" }).click();
    const anotacoes = page.getByRole("list", { name: "Anotações" }).getByRole("listitem");
    await expect(anotacoes).toHaveCount(1);
    await expect(anotacoes.first()).toContainText("Ligou e pediu uma proposta por e-mail.");
    await expect(anotacoes.first()).toContainText(nome);
    await expect(page.getByRole("heading", { name: "Anotações (1)" })).toBeVisible();

    // Próximo passo para hoje.
    const passo = page.getByRole("form", { name: "Próximo passo" });
    await passo.getByLabel("O que fazer").fill("Enviar a proposta");
    await passo.getByLabel("Até quando").fill(hoje());
    await passo.getByRole("button", { name: "Salvar próximo passo" }).click();
    await expect(page.getByRole("article", { name: "Próximo passo em aberto" })).toContainText("Enviar a proposta");
    await expect(page.getByRole("button", { name: "Trocar próximo passo" })).toBeVisible();

    // Aparece em "meus follow-ups de hoje", com atalho para concluir.
    await page.goto("/admin/leads");
    await page.getByRole("link", { name: "Meus follow-ups de hoje (1)" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Meus follow-ups de hoje" })).toBeVisible();
    const item = page.getByRole("article", { name: `${unico}: Enviar a proposta` });
    await expect(item).toContainText("Carla Dias");
    await expect(item.getByText("Hoje", { exact: true })).toBeVisible();
    await item.getByRole("button", { name: "Concluir: Enviar a proposta" }).click();
    await expect(item).toHaveCount(0);
    await expect(page.getByText("Nada para hoje. Nenhum follow-up atrasado.")).toBeVisible();
  });

  test("o campo de data não aceita dia passado", async ({ page }) => {
    const unico = `Passado ${Date.now()}`;
    const comercial = await createConfirmedUser("Comercial Datas");
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads/novo");
    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("Rui Costa");
    await page.getByLabel("E-mail do contato").fill("rui@exemplo.com");
    await page.locator('select[name="source"]').selectOption("outro");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await page.getByRole("list", { name: "Leads" }).getByRole("link", { name: unico }).click();

    const passo = page.getByRole("form", { name: "Próximo passo" });
    await expect(passo.getByLabel("Até quando")).toHaveAttribute("min", hoje());
    await passo.getByLabel("O que fazer").fill("Ligar ontem");
    await passo.getByLabel("Até quando").fill("2020-01-01");
    await passo.getByRole("button", { name: "Salvar próximo passo" }).click();
    await expect(passo.getByText("Escolha hoje ou um dia futuro.")).toBeVisible();
    await expect(page.getByText("Nenhum próximo passo combinado.")).toBeVisible();
  });
});
