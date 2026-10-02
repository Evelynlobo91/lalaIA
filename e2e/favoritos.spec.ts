import { expect, test } from "@playwright/test";
import { addFavorite, createTestEvent, createTestPlace } from "./support/db";
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

test.describe("favoritar evento (#44)", () => {
  test("favorita pela página do evento e aparece em Meus favoritos", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
    const titulo = `Show Favorito E2E ${Date.now()}`;
    const placeId = await createTestPlace(`Palco Favorito E2E ${Date.now()}`);
    const pessoa = await createConfirmedUser();
    const eventId = await createTestEvent({ ownerEmail: pessoa.email, placeId, title: titulo, startsInHours: 24, durationHours: 2 });
    await loginAs(page, pessoa, `/eventos/${eventId}`);

    await expect(page.getByRole("link", { name: /Quero ir/ })).toBeVisible();
    await page.getByRole("button", { name: "Favoritar" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    await page.waitForLoadState("networkidle");

    await page.goto("/perfil/favoritos?aba=eventos");
    await expect(page.getByRole("list", { name: "Eventos favoritos" }).getByText(titulo)).toBeVisible();
  });
});

test.describe("meus favoritos (#45)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("lista por tipo, marca evento encerrado e remove da lista", async ({ page }) => {
    const sufixo = Date.now();
    const lugar = `Museu Favorito E2E ${sufixo}`;
    const placeId = await createTestPlace(lugar);
    const pessoa = await createConfirmedUser("Quem Guarda");
    const futuro = `Show Favorito E2E ${sufixo}`;
    const passado = `Feira Encerrada E2E ${sufixo}`;
    await addFavorite(pessoa, "event", await createTestEvent({ ownerEmail: pessoa.email, placeId, title: futuro, startsInHours: 24, durationHours: 3 }));
    await addFavorite(pessoa, "event", await createTestEvent({ ownerEmail: pessoa.email, placeId, title: passado, startsInHours: -30, durationHours: 3 }));

    // Favorita o lugar pela página dele.
    await loginAs(page, pessoa, `/lugares/${placeId}`);
    await page.getByRole("button", { name: "Favoritar" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    await page.waitForLoadState("networkidle");

    // Chega pelo perfil.
    await page.goto("/perfil");
    await page.getByRole("link", { name: "Meus favoritos" }).click();
    await expect(page).toHaveURL(/\/perfil\/favoritos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Meus favoritos" })).toBeVisible();

    // Aba Lugares (padrão).
    const abas = page.getByRole("navigation", { name: "Tipo de favorito" });
    await expect(abas.getByRole("link", { name: /Lugares/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("list", { name: "Lugares favoritos" }).getByRole("link", { name: lugar })).toBeVisible();

    // Aba Eventos: o próximo primeiro, o encerrado marcado.
    await abas.getByRole("link", { name: /Eventos/ }).click();
    await expect(page).toHaveURL(/aba=eventos$/);
    const eventos = page.getByRole("list", { name: "Eventos favoritos" }).getByRole("listitem");
    await expect(eventos).toHaveCount(2);
    await expect(eventos.nth(0)).toContainText(futuro);
    await expect(eventos.nth(1)).toContainText(passado);
    await expect(eventos.nth(1).getByText("Encerrado")).toBeVisible();
    await expect(eventos.nth(0).getByText("Encerrado")).toHaveCount(0);

    // Remove o encerrado.
    await page.getByRole("button", { name: `Remover ${passado} dos favoritos` }).click();
    await expect(eventos).toHaveCount(1);
    await expect(eventos.first()).toContainText(futuro);

    // Remove o lugar: estado vazio.
    await abas.getByRole("link", { name: /Lugares/ }).click();
    await page.getByRole("button", { name: `Remover ${lugar} dos favoritos` }).click();
    await expect(page.getByText("Nenhum lugar favorito ainda")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorar lugares" })).toBeVisible();
  });

  test("sem login leva ao login e volta para a lista", async ({ page }) => {
    const pessoa = await createConfirmedUser();
    await page.goto("/perfil/favoritos");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fperfil%2Ffavoritos$/);
    await page.getByLabel("E-mail").fill(pessoa.email);
    await page.getByLabel("Senha", { exact: true }).fill(pessoa.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/perfil\/favoritos$/);
    await expect(page.getByText("Nenhum lugar favorito ainda")).toBeVisible();
  });
});

test.describe('"Quero ir" + como chegar (#46)', () => {
  test("abre a rota no app de mapas e registra o clique, mesmo sem login", async ({ page, context }) => {
    const placeId = await createTestPlace(`Parque Quero Ir E2E ${Date.now()}`);
    // A rota abre numa nova aba; o Google Maps não é carregado de verdade nos testes.
    await context.route("https://www.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Mapa</title>" }));

    await page.goto(`/lugares/${placeId}`);
    const queroIr = page.getByRole("link", { name: /Quero ir/ });
    await expect(queroIr).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-26\.\d+,-48\.\d+$/);
    await expect(queroIr).toHaveAttribute("target", "_blank");

    const registro = page.waitForResponse((r) => r.url().endsWith("/api/favorites/want-to-go") && r.request().method() === "POST");
    const [mapa] = await Promise.all([context.waitForEvent("page"), queroIr.click()]);
    const resposta = await registro;
    expect(resposta.status()).toBe(204);
    expect(resposta.request().postDataJSON()).toEqual({ entityType: "place", entityId: placeId });
    await expect(mapa).toHaveURL(/google\.com\/maps\/dir/);
    await mapa.close();
  });

  test("a API valida a entrada e não registra item inexistente", async ({ request }) => {
    const url = "/api/favorites/want-to-go";
    expect((await request.post(url, { data: { entityType: "place", entityId: "nao-e-um-id" } })).status()).toBe(400);
    expect((await request.post(url, { data: { entityType: "usuario", entityId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f" } })).status()).toBe(400);
    expect((await request.post(url, { data: { entityType: "place", entityId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f" } })).status()).toBe(404);
  });
});
