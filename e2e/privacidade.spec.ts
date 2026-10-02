import { expect, test } from "@playwright/test";
import { addFavorite, createTestPlace, interactionCounts } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("privacidade e dados (LGPD, #25)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("revogar métricas para de contar as visitas e desliga o 'Perto de mim'", async ({ page, context }) => {
    const pessoa = await createConfirmedUser();
    const placeId = await createTestPlace(`Café Privado ${Date.now()}`);
    await loginAs(page, pessoa, "/perfil/privacidade");

    await page.getByLabel(/Métricas de uso/).uncheck();
    await page.getByLabel(/Localização/).uncheck();
    await page.getByRole("button", { name: "Salvar escolhas" }).click();
    await expect(page.getByText("Escolhas salvas.")).toBeVisible();
    const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
    expect(cookies["lalaia-analytics"]).toBe("0");
    expect(cookies["lalaia-geo"]).toBe("0");

    // Visita sem registro de visualização.
    await page.goto(`/lugares/${placeId}`);
    await page.waitForLoadState("networkidle");
    expect(await interactionCounts(placeId)).toEqual({});

    // "Perto de mim" nem pede o GPS.
    await page.goto("/lugares");
    await page.getByRole("button", { name: "Perto de mim" }).click();
    await expect(page.getByText("Você desligou o uso da localização.")).toBeVisible();

    // Reativar: a escolha volta marcada.
    await page.goto("/perfil/privacidade");
    await expect(page.getByLabel(/Métricas de uso/)).not.toBeChecked();
    await page.getByLabel(/Métricas de uso/).check();
    await page.getByRole("button", { name: "Salvar escolhas" }).click();
    await expect(page.getByText("Escolhas salvas.")).toBeVisible();
  });

  test("exporta os dados em JSON e exclui a conta de vez", async ({ page }) => {
    const pessoa = await createConfirmedUser("Titular dos Dados");
    const placeId = await createTestPlace(`Bar Exportado ${Date.now()}`);
    await addFavorite(pessoa, "place", placeId);
    await loginAs(page, pessoa, "/perfil");
    await page.getByRole("link", { name: "Privacidade e dados" }).click();

    // Exportação: arquivo JSON com o cadastro e os favoritos.
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar meus dados" }).click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toMatch(/^lalaia-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
    const dados = JSON.parse(await (await arquivo.createReadStream()).toArray().then((parts) => Buffer.concat(parts).toString("utf8")));
    expect(dados.titular.email).toBe(pessoa.email);
    expect(dados.dados.conta.perfil.display_name).toBe("Titular dos Dados");
    expect(JSON.stringify(dados.dados.favoritos)).toContain(placeId);

    // Exclusão: confirmação obrigatória.
    await page.getByRole("button", { name: "Excluir minha conta" }).click();
    await expect(page.getByText("Digite EXCLUIR para confirmar.")).toBeVisible();
    await page.getByLabel("Digite EXCLUIR para confirmar").fill("excluir");
    await page.getByRole("button", { name: "Excluir minha conta" }).click();
    await expect(page).toHaveURL(/\/\?conta-excluida=1$/);
    await expect(page.getByText("Sua conta e seus dados foram excluídos.")).toBeVisible();

    // Sem sessão e sem conta: o login não funciona mais.
    expect((await page.request.get("/api/me/export")).status()).toBe(401);
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(pessoa.email);
    await page.getByLabel("Senha", { exact: true }).fill(pessoa.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /incorretos|inválid/i })).toBeVisible();
  });
});
