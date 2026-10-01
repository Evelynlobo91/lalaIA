import { expect, test, type Page } from "@playwright/test";

// Praça Nereu Ramos, centro de Joinville.
const CENTRO = { latitude: -26.3045, longitude: -48.8456 };

const distancias = async (page: Page) => {
  const cards = page.getByRole("list", { name: "Lugares por distância" }).getByRole("listitem");
  const textos = (await cards.locator("span").allTextContents()).filter((t) => /^\d+(,\d)? (m|km)$/.test(t));
  expect(textos).toHaveLength(await cards.count()); // uma distância por card
  return textos.map((t) => (t.endsWith(" km") ? parseFloat(t.replace(",", ".")) * 1000 : parseFloat(t)));
};

test.describe("lugares perto de mim (RF12)", () => {
  test("com GPS permitido: 'Perto de mim' lista por distância crescente", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(CENTRO);

    await page.goto("/lugares");
    await page.getByRole("button", { name: "Perto de mim" }).click();

    await expect(page).toHaveURL(/\/lugares\/perto\?lat=-26\.3045&lon=-48\.8456$/);
    await expect(page.getByRole("heading", { level: 1, name: "Perto de você" })).toBeVisible();
    const d = await distancias(page);
    expect(d.length).toBeGreaterThan(5);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(Math.max(...d)).toBeLessThanOrEqual(2000);
  });

  test("com GPS negado: explica e oferece escolher no mapa", async ({ page }) => {
    await page.goto("/lugares");
    // Sem permissão concedida, o navegador nega a geolocalização.
    await page.getByRole("button", { name: "Perto de mim" }).click();
    await expect(page.getByText("Sem permissão para usar sua localização.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Escolha um ponto no mapa" })).toHaveAttribute("href", "/mapa");
  });

  test("raio maior traz mais lugares, e o raio ativo fica marcado", async ({ page }) => {
    await page.goto(`/lugares/perto?lat=${CENTRO.latitude}&lon=${CENTRO.longitude}&radius=1000`);
    const perto = (await distancias(page)).length;

    await page.getByRole("link", { name: "Até 5 km" }).click();
    await expect(page.getByRole("link", { name: "Até 5 km" })).toHaveAttribute("aria-current", "true");
    expect((await distancias(page)).length).toBeGreaterThanOrEqual(perto);
  });

  test("ponto fora de Joinville mostra mensagem clara", async ({ page }) => {
    await page.goto("/lugares/perto?lat=-23.55&lon=-46.63");
    await expect(page.getByText("Fora da área atendida (Joinville e arredores).")).toBeVisible();
  });

  test("sem GPS: tocar num ponto vazio do mapa leva aos lugares perto dali", async ({ page }) => {
    await page.goto("/mapa");
    const mapa = page.getByRole("region", { name: "Mapa de lugares de Joinville" });
    await expect(mapa).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // Procura um ponto do mapa sem lugar (toque num lugar abre o resumo, não o ponto).
    const box = (await mapa.boundingBox())!;
    for (const [fx, fy] of [[0.15, 0.85], [0.85, 0.85], [0.15, 0.6], [0.85, 0.6], [0.5, 0.9]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (await page.getByRole("region", { name: "Ponto escolhido no mapa" }).isVisible()) break;
      await page.getByRole("button", { name: "Fechar resumo" }).click().catch(() => undefined);
    }

    await page.getByRole("link", { name: "Lugares perto daqui" }).click();
    await expect(page).toHaveURL(/\/lugares\/perto\?lat=-26\.\d{1,4}&lon=-48\.\d{1,4}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Perto de você" })).toBeVisible();
  });

  test("API valida a entrada e não aceita coordenada de fora", async ({ request }) => {
    expect((await request.get("/api/places/nearby?lat=-23.55&lon=-46.63")).status()).toBe(400);
    const ok = await request.get(`/api/places/nearby?lat=${CENTRO.latitude}&lon=${CENTRO.longitude}`);
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.items[0]).toHaveProperty("distanceLabel");
  });
});
