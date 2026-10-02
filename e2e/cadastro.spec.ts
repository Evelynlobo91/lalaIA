import { expect, test } from "@playwright/test";
import { countEmails, firstLink, waitForEmail } from "./support/mailpit";

// Fluxo real contra o Supabase local: Auth + trigger do banco + e-mail no Mailpit.
test.describe("cadastro de usuário (RF01)", () => {
  // O e-mail é único por execução; um projeto (viewport) basta para o fluxo completo.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  const novoEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lalaia.test`;

  async function preencher(page: import("@playwright/test").Page, email: string) {
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Pessoa E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("joinville2026");
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar minha conta" }).click();
  }

  test("cadastra, recebe e-mail e confirma a conta pelo link", async ({ page, baseURL }) => {
    const email = novoEmail();
    await preencher(page, email);

    await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();

    const mail = await waitForEmail(email);
    expect(mail.subject).toBe("Confirme seu e-mail no LalaIA");

    // O link aponta para o site_url configurado; nos testes o app roda em outra porta.
    const link = new URL(firstLink(mail.html));
    expect(link.pathname).toBe("/auth/confirm");
    await page.goto(`${baseURL}${link.pathname}${link.search}`);

    await expect(page).toHaveURL(/\/\?bem-vindo=1$/);
    await expect(page.getByText("E-mail confirmado! Sua conta está ativa.")).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))).toBe(true);
  });

  test("valida os campos e mantém o que foi digitado (menos a senha)", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Nome").fill("Pessoa");
    await page.getByLabel("E-mail").fill("invalido@");
    await page.getByLabel("Senha", { exact: true }).fill("abc");
    await page.getByRole("button", { name: "Criar minha conta" }).click();

    await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
    await expect(page.getByText("Você precisa aceitar os Termos de Uso")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Nome")).toHaveValue("Pessoa");
  });

  test("e-mail já cadastrado recebe a mesma resposta, sem revelar que existe", async ({ page }) => {
    const email = novoEmail();
    await preencher(page, email);
    await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
    await waitForEmail(email);

    // Segunda tentativa: a tela é idêntica à de um cadastro novo. (Se a conta ainda não foi
    // confirmada, o Supabase reenvia a confirmação para o dono do e-mail, o que é esperado.)
    await preencher(page, email);
    await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
    await expect(page.getByText(/Muitas tentativas|Algo deu errado|já cadastrado/)).toHaveCount(0);
    expect(await countEmails(email)).toBeGreaterThanOrEqual(1);
  });

  test("link de confirmação inválido volta ao cadastro com aviso", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=invalido&type=email&next=https://evil.com");
    await expect(page).toHaveURL(/\/cadastro\?erro=link-invalido$/);
    await expect(page.getByText("O link de confirmação é inválido ou expirou.")).toBeVisible();
  });
});
