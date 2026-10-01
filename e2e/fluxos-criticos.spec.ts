import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestMission, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Fluxos críticos (#80, RNF12): rodam em todos os navegadores do config (Chromium, Safari/WebKit no iPhone
// e Firefox). Cada teste é independente e cria os próprios dados.
test.describe("fluxos críticos em todos os navegadores", () => {
  test("visitante: busca, abre o lugar e vê como chegar", async ({ page }) => {
    const nome = `Café Navegadores ${Date.now()}`;
    await createTestPlace(nome);

    await page.goto("/");
    await page.getByRole("searchbox").first().fill(nome);
    await page.getByRole("searchbox").first().press("Enter");
    await expect(page).toHaveURL(/\/buscar\?/);
    await page.getByRole("link", { name: new RegExp(nome) }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("link", { name: /Quero ir|Como chegar/ })).toHaveAttribute("href", /google\.com\/maps/);
  });

  test("visitante: agenda de eventos e detalhe", async ({ page }) => {
    const titulo = `Show Navegadores ${Date.now()}`;
    const placeId = await createTestPlace(`Palco Navegadores ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: titulo, startsInHours: 3, durationHours: 2 });

    await page.goto("/eventos?quando=hoje");
    await expect(page.getByRole("heading", { level: 1, name: "O que fazer" })).toBeVisible();
    await page.goto(`/eventos/${eventId}`);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
  });

  test("conta: entra, favorita um lugar, vê em Meus favoritos e sai", async ({ page }) => {
    const nome = `Bar Navegadores ${Date.now()}`;
    const placeId = await createTestPlace(nome);
    const pessoa = await createConfirmedUser();

    await loginAs(page, pessoa, `/lugares/${placeId}`);
    await page.getByRole("button", { name: "Favoritar" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    await page.waitForLoadState("networkidle");

    await page.goto("/perfil/favoritos");
    await expect(page.getByText(nome)).toBeVisible();

    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("missão: aceita e acompanha o progresso", async ({ page }) => {
    const placeId = await createTestPlace(`Café Missão Navegadores ${Date.now()}`);
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão Navegadores ${Date.now()}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, steps: [{ title: "Peça um café", placeId }] });

    await loginAs(page, await createConfirmedUser(), "/missoes");
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();
  });

  test("Me Surpreenda monta um roteiro (ou explica por que não)", async ({ page }) => {
    await page.goto("/surpreenda?tempo=180&orcamento=sem");
    await expect(page.getByRole("heading", { level: 1, name: "Me Surpreenda" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Seu roteiro" }).or(page.getByText("Não achamos um roteiro com essas escolhas"))).toBeVisible();
  });
});
