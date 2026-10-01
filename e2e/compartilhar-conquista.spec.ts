import { expect, test } from "@playwright/test";
import { unlockTestAchievement } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("compartilhar conquista (#70)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("botão compartilha (ou copia) o link; a página pública mostra a conquista, a imagem e o convite", async ({ page, context, browser }) => {
    const pessoa = await createConfirmedUser("Ana Exploradora");
    const unlockId = await unlockTestAchievement(pessoa, "primeira-missao");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Sem menu nativo neste navegador de teste: o botão cai na cópia do link.
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));

    await loginAs(page, pessoa, "/perfil");
    const conquista = page.getByRole("listitem", { name: /: desbloqueada$/ });
    await conquista.getByRole("button", { name: /Compartilhar a conquista/ }).click();
    await expect(conquista.getByText("Link copiado")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`/conquistas/${unlockId}$`));

    // Quem recebe o link (sem conta) vê só o primeiro nome e o convite.
    const visitante = await browser.newContext();
    const pagina = await visitante.newPage();
    await pagina.goto(new URL(link).pathname);
    await expect(pagina.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(pagina.getByText("Ana desbloqueou")).toBeVisible();
    await expect(pagina.getByText("Exploradora")).toHaveCount(0);
    await expect(pagina.getByText("Desbloqueie essa experiência no LalaIA")).toBeVisible();
    await expect(pagina.getByRole("link", { name: /Ver missões/ })).toHaveAttribute("href", "/missoes");

    const og = await pagina.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBeTruthy();
    // A meta usa a URL canônica (NEXT_PUBLIC_SITE_URL); no teste, busca o mesmo caminho no servidor de teste.
    const imagem = await pagina.request.get(new URL(og!).pathname);
    expect(imagem.status()).toBe(200);
    expect(imagem.headers()["content-type"]).toContain("image/png");
    await visitante.close();
  });

  test("link inválido ou inexistente → 404", async ({ page }) => {
    expect((await page.goto("/conquistas/nao-e-um-id"))?.status()).toBe(404);
    expect((await page.goto(`/conquistas/${crypto.randomUUID()}`))?.status()).toBe(404);
  });
});
