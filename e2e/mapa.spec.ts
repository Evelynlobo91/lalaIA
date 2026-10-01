import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function umLugar(): Promise<{ id: string; name: string }> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const [row] = await sql<{ id: string; name: string }[]>`select id, name from places.places where category = 'cultura' order by name limit 1`;
    return row;
  } finally {
    await sql.end();
  }
}

const mapa = (page: Page) => page.getByRole("region", { name: "Mapa de lugares de Joinville" });

test.describe("mapa de lugares (RF11)", () => {
  test("carrega o mapa sem erros, com atribuição e atalho para a lista", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));

    await page.goto("/mapa");
    await expect(mapa(page)).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    await expect(mapa(page).locator("canvas")).toBeVisible();
    await expect(page.getByText("OpenStreetMap contributors").first()).toBeAttached();
    await expect(page.getByRole("link", { name: "Ver em lista" })).toHaveAttribute("href", "/lugares");
    expect(erros).toEqual([]);
  });

  test("API de pontos devolve GeoJSON cacheável com os lugares", async ({ request }) => {
    const res = await request.get("/api/places/geo");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("max-age=300");
    const geo = await res.json();
    expect(geo.type).toBe("FeatureCollection");
    expect(geo.features.length).toBeGreaterThan(400);
    const [lon, lat] = geo.features[0].geometry.coordinates;
    expect(lon).toBeLessThan(-48);
    expect(lat).toBeLessThan(-26);
  });

  test("do detalhe, 'Ver no mapa' abre o mapa centralizado com o resumo do lugar", async ({ page }) => {
    const lugar = await umLugar();
    await page.goto(`/lugares/${lugar.id}`);
    await page.getByRole("link", { name: "Ver no mapa", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/mapa\\?lugar=${lugar.id}$`));
    const resumo = page.getByRole("region", { name: `Resumo: ${lugar.name}` });
    await expect(resumo).toBeVisible();
    await expect(resumo.getByRole("link", { name: "Ver detalhes" })).toHaveAttribute("href", `/lugares/${lugar.id}`);
    await expect(resumo.getByRole("link", { name: "Como chegar" })).toHaveAttribute("href", /google\.com\/maps\/dir/);
  });

  test("tocar no marcador abre o resumo do lugar", async ({ page }) => {
    const lugar = await umLugar();
    await page.goto(`/mapa?lugar=${lugar.id}`);
    await expect(mapa(page)).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

    // Fecha o resumo aberto pelo link e toca no marcador, que está no centro do mapa (zoom 16).
    await page.getByRole("button", { name: "Fechar resumo" }).click();
    await expect(page.getByRole("region", { name: /^Resumo:/ })).toHaveCount(0);
    await page.waitForTimeout(1500); // dados do GeoJSON renderizados
    const box = (await mapa(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.getByRole("region", { name: `Resumo: ${lugar.name}` })).toBeVisible();
  });

  test("id inexistente no link do mapa só abre o mapa geral", async ({ page }) => {
    const res = await page.goto("/mapa?lugar=00000000-0000-4000-8000-000000000000");
    expect(res?.status()).toBe(200);
    await expect(mapa(page)).toBeVisible();
    await expect(page.getByRole("region", { name: /^Resumo:/ })).toHaveCount(0);
  });
});
