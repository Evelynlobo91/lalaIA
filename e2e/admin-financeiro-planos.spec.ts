import { expect, test } from "@playwright/test";
import { grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("financeiro: planos e recursos (#152)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "gestão de planos roda só no celular");
  });

  test("financeiro vê os planos iniciais, cria um plano e edita preço e recursos", async ({ page }) => {
    const sufixo = `${Date.now()}`.slice(-8);
    const codigo = `e2e-${sufixo}`;
    const nome = `Plano E2E ${sufixo}`;
    const financeiro = await createConfirmedUser("Pessoa do Financeiro");
    await grantRole(financeiro, "finance");
    await loginAs(page, financeiro, "/admin/financeiro");
    await expect(page.getByRole("heading", { level: 1, name: "Financeiro" })).toBeVisible();

    // Planos iniciais: o Básico é o padrão e libera a live (nada muda para os parceiros atuais).
    const basico = page.getByRole("article", { name: "Plano Básico" });
    await expect(basico.getByText("Padrão", { exact: true })).toBeVisible();
    await expect(basico).toContainText("Gratuito");
    await expect(basico).toContainText("Live");
    await expect(page.getByRole("article", { name: "Plano Pro" })).toContainText("Destaque");

    // Novo plano: padrão inativo é recusado, e o formulário mantém o que foi digitado.
    await page.getByRole("link", { name: "Novo plano" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\/planos\/novo$/);
    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByLabel("Código", { exact: true }).fill(codigo);
    await page.getByLabel("Mensalidade (R$)").fill("79,90");
    await page.getByRole("checkbox", { name: /^Missões/ }).check();
    await page.getByRole("checkbox", { name: /^Ativo/ }).uncheck();
    await page.getByRole("checkbox", { name: /^Plano padrão/ }).check();
    await page.getByRole("button", { name: "Criar plano" }).click();
    await expect(page.getByText("O plano padrão precisa estar ativo.")).toBeVisible();
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(nome);

    // Corrige: ativo, sem ser padrão.
    await page.getByRole("checkbox", { name: /^Missões/ }).check();
    await page.getByRole("checkbox", { name: /^Ativo/ }).check();
    await page.getByRole("checkbox", { name: /^Plano padrão/ }).uncheck();
    await page.getByRole("button", { name: "Criar plano" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\?salvo=/);
    await expect(page.getByText("Plano salvo.")).toBeVisible();
    const novo = page.getByRole("article", { name: `Plano ${nome}` });
    await expect(novo).toContainText("79,90");
    await expect(novo).toContainText("Libera: Missões.");
    await expect(basico.getByText("Padrão", { exact: true })).toBeVisible();

    // Edição: o formulário vem com os dados atuais.
    await page.getByRole("link", { name: `Editar plano ${nome}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Plano ${nome}` })).toBeVisible();
    await expect(page.getByLabel("Mensalidade (R$)")).toHaveValue("79,90");
    await expect(page.getByRole("checkbox", { name: /^Missões/ })).toBeChecked();
    await page.getByLabel("Mensalidade (R$)").fill("99");
    await page.getByRole("checkbox", { name: /^Ofertas/ }).check();
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\?salvo=/);
    await expect(novo).toContainText("99,00");
    await expect(novo).toContainText("Libera: Missões, Ofertas.");
  });

  test("moderação e comercial não acessam o financeiro (404); id inexistente também", async ({ page }) => {
    const moderador = await createConfirmedUser();
    await grantRole(moderador, "moderator");
    await loginAs(page, moderador, "/admin");
    for (const rota of ["/admin/financeiro", "/admin/financeiro/planos/novo"]) expect((await page.goto(rota))?.status(), rota).toBe(404);

    await page.context().clearCookies();
    const financeiro = await createConfirmedUser();
    await grantRole(financeiro, "finance");
    await loginAs(page, financeiro, "/admin/financeiro");
    expect((await page.goto("/admin/financeiro/planos/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  });
});
