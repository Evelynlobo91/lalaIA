import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, type TestUser } from "./support/users";

test.describe("login e logout (RF02)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  async function entrar(page: Page, user: Pick<TestUser, "email" | "password">) {
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
  }

  const sessionCookies = async (page: Page) =>
    (await page.context().cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  test("rota protegida leva ao login e volta para ela depois de entrar", async ({ page }) => {
    const user = await createConfirmedUser("Lala E2E");

    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fperfil$/);

    await entrar(page, user);

    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByText("Lala E2E")).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("sessão fica em cookie httpOnly (inacessível ao JavaScript da página)", async ({ page }) => {
    const user = await createConfirmedUser();
    await page.goto("/entrar");
    await entrar(page, user);
    await expect(page).toHaveURL(/\/$/);

    const cookies = await sessionCookies(page);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");
  });

  test("senha errada e e-mail inexistente têm a mesma mensagem genérica", async ({ page }) => {
    const user = await createConfirmedUser();

    await page.goto("/entrar");
    await entrar(page, { email: user.email, password: "senhaErrada1" });
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveValue(user.email);
    await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");

    await entrar(page, { email: "ninguem-tem-esse@lalaia.test", password: "senhaErrada1" });
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("logout encerra a sessão e a rota protegida volta a exigir login", async ({ page }) => {
    const user = await createConfirmedUser();
    await page.goto("/entrar?next=/perfil");
    await entrar(page, user);
    await expect(page).toHaveURL(/\/perfil$/);

    await page.getByRole("button", { name: "Sair" }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(await sessionCookies(page)).toHaveLength(0);
    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fperfil$/);
  });

  test("next externo é ignorado após o login (sem open redirect)", async ({ page }) => {
    const user = await createConfirmedUser();
    await page.goto("/entrar?next=https://evil.com");
    await entrar(page, user);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("quem já está logado e abre /entrar vai direto para o destino", async ({ page }) => {
    const user = await createConfirmedUser();
    await page.goto("/entrar");
    await entrar(page, user);
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/entrar?next=/perfil");
    await expect(page).toHaveURL(/\/perfil$/);
  });
});
