import { expect, test } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("CRM: funil e histórico (#148)", () => {
  test("comercial move o lead pelo funil, perde com motivo, reabre e vê o histórico", async ({ page }, testInfo) => {
    const unico = `Funil ${Date.now()} ${testInfo.project.name}`;
    const nome = `Comercial Funil ${Date.now()}`;
    const comercial = await createConfirmedUser(nome);
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads/novo");

    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("João Pereira");
    await page.getByLabel("Telefone do contato").fill("47988887777");
    await page.locator('select[name="source"]').selectOption("visita");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);

    await page.getByRole("link", { name: "Ver funil" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Funil de leads" })).toBeVisible();
    const coluna = (etapa: string) => page.getByRole("list", { name: `Leads em ${etapa}`, exact: true });
    const mover = page.getByRole("form", { name: `Mover ${unico}` });
    await expect(coluna("Lead").getByRole("article", { name: unico })).toBeVisible();

    // Lead → Proposta (sem motivo). "Parceiro ativo" não é opção: isso é a conversão.
    await expect(mover.getByRole("option")).toHaveText(["Escolha", "Contato", "Proposta", "Perdido"]);
    await mover.getByLabel("Mover para").selectOption("proposta");
    await mover.getByRole("button", { name: "Mover" }).click();
    await expect(coluna("Proposta").getByRole("article", { name: unico })).toBeVisible();

    // Proposta → Perdido: o motivo aparece e é obrigatório.
    await mover.getByLabel("Mover para").selectOption("perdido");
    await mover.getByLabel("Motivo da perda").fill("Sem verba neste semestre.");
    await mover.getByRole("button", { name: "Mover" }).click();
    const perdido = coluna("Perdido").getByRole("article", { name: unico });
    await expect(perdido).toContainText("Motivo: Sem verba neste semestre.");

    // Perdido → Contato (reabre).
    await mover.getByLabel("Mover para").selectOption("contato");
    await mover.getByRole("button", { name: "Mover" }).click();
    await expect(coluna("Contato").getByRole("article", { name: unico })).toBeVisible();

    // Histórico na página do lead, do mais recente para o mais antigo.
    await coluna("Contato").getByRole("link", { name: unico }).click();
    await expect(page.getByRole("heading", { level: 1, name: unico })).toBeVisible();
    const historico = page.getByRole("list", { name: "Histórico de etapas" }).getByRole("listitem");
    await expect(historico).toHaveCount(3);
    await expect(historico.nth(0)).toContainText("Perdido → Contato");
    await expect(historico.nth(1)).toContainText("Proposta → Perdido");
    await expect(historico.nth(1)).toContainText("Motivo: Sem verba neste semestre.");
    await expect(historico.nth(2)).toContainText("Lead → Proposta");
    await expect(historico.nth(0)).toContainText(nome);

    // O quadro não alarga a página (as colunas rolam dentro dele).
    await page.goto("/admin/leads/funil");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, testInfo.project.name).toBeLessThanOrEqual(0);
  });

  test("o seletor de etapa funciona só com o teclado", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "teclado físico: só no desktop");
    const unico = `Teclado ${Date.now()}`;
    const comercial = await createConfirmedUser("Comercial Teclado");
    await grantRole(comercial, "commercial");
    await loginAs(page, comercial, "/admin/leads/novo");
    await page.getByLabel("Estabelecimento").fill(unico);
    await page.getByLabel("Nome do contato").fill("Ana Lima");
    await page.getByLabel("E-mail do contato").fill("ana@exemplo.com");
    await page.locator('select[name="source"]').selectOption("indicacao");
    await page.getByRole("button", { name: "Cadastrar lead" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?salvo=/);
    await page.goto("/admin/leads/funil");

    const mover = page.getByRole("form", { name: `Mover ${unico}` });
    await mover.getByLabel("Mover para").focus();
    await page.keyboard.press("c"); // seleciona "Contato" pela letra
    await page.keyboard.press("Tab");
    await expect(mover.getByRole("button", { name: "Mover" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Leads em Contato", exact: true }).getByRole("article", { name: unico })).toBeVisible();
  });
});
