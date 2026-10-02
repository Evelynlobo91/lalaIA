import { expect, test } from "@playwright/test";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// PNG 1x1 válido.
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.describe("editar perfil e preferências (RF03)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("sem login, /perfil/editar leva para entrar", async ({ page }) => {
    await page.goto("/perfil/editar");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fperfil%2Feditar$/);
  });

  test("altera o nome e vê no perfil", async ({ page }) => {
    const user = await createConfirmedUser("Nome Antigo");
    await loginAs(page, user, "/perfil/editar");

    await page.getByLabel("Nome").fill("Lala Joinville");
    await page.getByRole("button", { name: "Salvar dados" }).click();
    await expect(page.getByText("Dados atualizados.")).toBeVisible();

    await page.goto("/perfil");
    await expect(page.getByRole("heading", { name: "Lala Joinville" })).toBeVisible();
  });

  test("nome vazio mostra erro no campo", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil/editar");

    await page.getByLabel("Nome").fill("   ");
    await page.getByRole("button", { name: "Salvar dados" }).click();
    await expect(page.getByText("Informe seu nome.")).toBeVisible();
  });

  test("salva preferências e elas aparecem no perfil e ao voltar à edição", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil/editar");

    await page.getByText("Museus e cultura", { exact: true }).click();
    await page.getByText("Shows e música", { exact: true }).click();
    await page.getByLabel("Quanto costuma gastar por saída?").selectOption({ label: "Até R$ 100" });
    await page.getByLabel("Até que distância você topa ir?").selectOption({ label: "Até 5 km" });
    await page.getByText("Com amigos", { exact: true }).click();
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByText("Preferências salvas.")).toBeVisible();

    await page.goto("/perfil");
    const favoritas = page.getByRole("list", { name: "Categorias favoritas" });
    await expect(favoritas.getByText("Museus e cultura")).toBeVisible();
    await expect(favoritas.getByText("Shows e música")).toBeVisible();
    await expect(page.getByText("Até R$ 100")).toBeVisible();
    await expect(page.getByText("Até 5 km")).toBeVisible();
    await expect(page.getByText("Com amigos")).toBeVisible();

    await page.goto("/perfil/editar");
    await expect(page.getByRole("checkbox", { name: "Museus e cultura" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Bares" })).not.toBeChecked();
  });

  test("envia foto de perfil e ela aparece no perfil", async ({ page }) => {
    const user = await createConfirmedUser("Com Foto");
    await loginAs(page, user, "/perfil/editar");

    await page.locator('input[name="avatar"]').setInputFiles({ name: "eu.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByText("Foto atualizada.")).toBeVisible();

    await page.goto("/perfil");
    const foto = page.getByRole("img", { name: "Foto de Com Foto" });
    await expect(foto).toBeVisible();
    await expect(foto).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/\d+\.png$/);
    // A imagem foi realmente gravada e é servida pelo Storage.
    const src = await foto.getAttribute("src");
    expect((await page.request.get(src!)).status()).toBe(200);
  });

  test("recusa arquivo disfarçado de imagem", async ({ page }) => {
    const user = await createConfirmedUser();
    await loginAs(page, user, "/perfil/editar");

    await page.locator('input[name="avatar"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
    await expect(page.getByText("Use uma imagem JPG, PNG ou WebP.")).toBeVisible();
  });
});
