import { expect, test } from "@playwright/test";
import { createApprovedPartner, grantRole } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("backoffice: cadastrar estabelecimento (#143)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de cadastro roda só no celular");
  });

  test("admin cadastra um lugar, que aparece na página pública e na busca do backoffice", async ({ page }) => {
    const nome = `Cantina Nova ${Date.now()}`;
    const admin = await createConfirmedUser("Admin Cadastro");
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin/conteudo");

    await page.getByRole("link", { name: "Cadastrar estabelecimento" }).click();
    await expect(page).toHaveURL(/\/admin\/conteudo\/lugares\/novo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cadastrar estabelecimento" })).toBeVisible();

    // Fora de Joinville: recusa e mantém o que foi digitado.
    await page.getByLabel("Nome").fill(nome);
    await page.getByLabel("Categoria").selectOption("restaurantes");
    await page.getByLabel("Bairro").fill("Centro");
    await page.getByLabel("Latitude").fill("-23.55");
    await page.getByLabel("Longitude").fill("-46.63");
    await page.getByRole("button", { name: "Cadastrar estabelecimento" }).click();
    await expect(page.getByText("Fora de Joinville.").first()).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveValue(nome);

    // Dentro de Joinville (com vírgula decimal): cadastra e segue para a edição.
    await page.getByLabel("Latitude").fill("-26,1305");
    await page.getByLabel("Longitude").fill("-48,9612");
    await page.getByRole("button", { name: "Cadastrar estabelecimento" }).click();
    await expect(page).toHaveURL(/\/admin\/conteudo\/lugares\/[0-9a-f-]{36}\/editar\?criado=1$/);
    await expect(page.getByText("Estabelecimento cadastrado.")).toBeVisible();
    const placeId = page.url().match(/lugares\/([0-9a-f-]{36})\//)![1];

    // Página pública.
    await page.goto(`/lugares/${placeId}`);
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByText("Centro").first()).toBeVisible();

    // Busca do backoffice.
    await page.goto(`/admin/conteudo?tipo=lugares&q=${encodeURIComponent(nome)}`);
    await expect(page.getByRole("list", { name: "Lugares" }).getByText(nome)).toBeVisible();
  });

  test("quem não é admin não acessa o cadastro (404)", async ({ page }) => {
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    await loginAs(page, parceiro);
    expect((await page.goto("/admin/conteudo/lugares/novo"))?.status()).toBe(404);
  });
});
