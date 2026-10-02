import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace, isolatedPoint } from "./support/db";
import { createConfirmedUser } from "./support/users";

// Cenários num ponto isolado (zona rural): só os dados do próprio teste ficam "perto".
async function palcoComEventos(tag: string) {
  const ponto = isolatedPoint();
  const placeId = await createTestPlace(`Palco Rec ${tag}`, ponto, "shows");
  const dono = await createConfirmedUser();
  await createApprovedPartner(dono);
  await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show grátis ${tag}`, startsInHours: -0.5, durationHours: 3, category: "shows" });
  await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show caro ${tag}`, startsInHours: -0.5, durationHours: 3, category: "shows", priceCents: 8_000 });
  return ponto;
}

test.describe("Agora perto de você (#75)", () => {
  test("home mostra o feed ranqueado com distância, tempo desde o início e motivos", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra do feed não depende da largura da tela");
    const tag = `${Date.now()}`;
    const ponto = await palcoComEventos(tag);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Agora em Joinville", level: 2 })).toBeVisible();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon });
    await page.getByRole("button", { name: "Ver o que está perto" }).click();
    await expect(page).toHaveURL(/\/\?lat=-26\.\d{1,4}&lon=-48\.\d{1,4}$/);
    await expect(page.getByRole("heading", { name: "Agora perto de você", level: 2 })).toBeVisible();

    const feed = page.getByRole("list", { name: "Agora perto de você" });
    const card = feed.getByRole("listitem").filter({ hasText: `Show grátis ${tag}` });
    await expect(card).toContainText(/Começou há (29|30|31) min/);
    await expect(card).toContainText("10 m");
    await expect(card.getByRole("list", { name: "Por que sugerimos" })).toContainText("Acontecendo agora");
    // Visitante não tem orçamento no perfil: o pago também aparece.
    await expect(feed.getByRole("listitem").filter({ hasText: `Show caro ${tag}` })).toBeVisible();
  });

  test("localização fora da área não quebra a home; API valida", async ({ page, request }) => {
    await page.goto("/?lat=-23.55&lon=-46.63");
    await expect(page.getByText(/Fora da área atendida/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agora em Joinville", level: 2 })).toBeVisible();
    expect((await request.get("/api/recommendations/now?lat=-23.55&lon=-46.63")).status()).toBe(400);
    expect((await request.get("/api/recommendations/now")).status()).toBe(200);
  });
});

test.describe("restrições (#73) e score (#72)", () => {
  test("em até 3 toques: orçamento, tipo e tempo filtram as sugestões; o estado fica na URL", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra de filtro não depende da largura da tela");
    const tag = `${Date.now()}`;
    const ponto = await palcoComEventos(tag);

    await page.goto(`/sugestoes?lat=${ponto.lat.toFixed(4)}&lon=${ponto.lon.toFixed(4)}`);
    const lista = page.getByRole("list", { name: "Sugestões ordenadas para você" });
    await expect(lista.getByText(`Show caro ${tag}`)).toBeVisible();

    // Toque 1: só grátis.
    await page.getByRole("navigation", { name: "Quanto quer gastar (no total)?" }).getByRole("link", { name: "Grátis" }).click();
    await expect(page).toHaveURL(/orcamento=0/);
    await expect(lista.getByText(`Show grátis ${tag}`)).toBeVisible();
    await expect(lista.getByText(`Show caro ${tag}`)).toHaveCount(0);

    // Toque 2: tipo de experiência (preserva o orçamento e a localização).
    await page.getByRole("navigation", { name: "Que tipo de experiência?" }).getByRole("link", { name: "Música e festa" }).click();
    await expect(page).toHaveURL(/orcamento=0&pessoas=1&tipo=musica-festa&lat=/);
    await expect(page.getByRole("navigation", { name: "Que tipo de experiência?" }).getByRole("link", { name: "Música e festa" })).toHaveAttribute("aria-current", "true");
    await expect(lista.getByText(`Show grátis ${tag}`)).toBeVisible();

    // Toque 3: outro tipo tira os shows.
    await page.getByRole("navigation", { name: "Que tipo de experiência?" }).getByRole("link", { name: "Cultura" }).click();
    await expect(page.getByText(`Show grátis ${tag}`)).toHaveCount(0);

    // Remover a localização mantém o resto.
    await page.getByRole("link", { name: "Remover localização" }).click();
    await expect(page).toHaveURL(/\/sugestoes\?tempo=120&orcamento=0&pessoas=1&tipo=cultura$/);
  });

  test("restrição inválida mostra aviso; as APIs validam com zod", async ({ page, request }) => {
    await page.goto("/sugestoes?tipo=radical");
    await expect(page.getByText(/Tipo de experiência inválido/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sugestões pra você", level: 1 })).toBeVisible();

    expect((await request.get("/api/recommendations/for-me?tipo=radical")).status()).toBe(400);
    expect((await request.get("/api/recommendations/for-me?tempo=120&orcamento=sem")).status()).toBe(200);
    expect((await request.get("/api/recommendations/candidates?categoria=nao-existe")).status()).toBe(400);
    const ok = await request.get("/api/recommendations?limite=5");
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.items.length).toBeLessThanOrEqual(5);
    for (const item of body.items) expect(Array.isArray(item.reasons)).toBe(true);
  });
});
