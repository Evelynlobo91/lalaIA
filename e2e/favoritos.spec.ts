import { expect, test } from "@playwright/test";
import { createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("favoritar lugar (#44)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("sem login leva ao login e volta; favoritar e desfavoritar persistem", async ({ page }) => {
    const nome = `Café Favorito E2E ${Date.now()}`;
    const placeId = await createTestPlace(nome);
    const pessoa = await createConfirmedUser("Quem Favorita");

    // 1. Sem login: "Favoritar" leva ao login e volta para o lugar.
    await page.goto(`/lugares/${placeId}`);
    await page.getByRole("link", { name: "Favoritar" }).click();
    await expect(page).toHaveURL(new RegExp(`/entrar\\?next=${encodeURIComponent(`/lugares/${placeId}`).replace(/[?]/g, "\\$&")}$`));
    await page.getByLabel("E-mail").fill(pessoa.email);
    await page.getByLabel("Senha", { exact: true }).fill(pessoa.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(new RegExp(`/lugares/${placeId}$`));

    // 2. Favorita (otimista) e o estado sobrevive ao recarregar.
    const favoritar = page.getByRole("button", { name: "Favoritar" });
    await expect(favoritar).toHaveAttribute("aria-pressed", "false");
    await favoritar.click();
    const remover = page.getByRole("button", { name: "Remover dos favoritos" });
    await expect(remover).toHaveAttribute("aria-pressed", "true");
    // Espera a action terminar antes de recarregar.
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(remover).toHaveAttribute("aria-pressed", "true");

    // 3. Desfavorita.
    await remover.click();
    await expect(favoritar).toHaveAttribute("aria-pressed", "false");
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(favoritar).toHaveAttribute("aria-pressed", "false");
  });

  test("cliques repetidos terminam no estado do último clique (idempotente)", async ({ page }) => {
    const placeId = await createTestPlace(`Bar Favorito E2E ${Date.now()}`);
    const pessoa = await createConfirmedUser();
    await loginAs(page, pessoa, `/lugares/${placeId}`);

    await page.getByRole("button", { name: "Favoritar" }).click();
    await page.getByRole("button", { name: "Remover dos favoritos" }).click();
    await page.getByRole("button", { name: "Favoritar" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
  });
});
