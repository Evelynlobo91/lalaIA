import { expect, test } from "@playwright/test";

test.describe("lista de lugares (RF09)", () => {
  test("mostra lugares de Joinville com categoria e atribuição do OpenStreetMap", async ({ page }) => {
    await page.goto("/lugares");
    await expect(page.getByRole("heading", { level: 1, name: "Onde ir" })).toBeVisible();

    const lista = page.getByRole("list", { name: "Lugares" });
    await expect(lista.getByRole("listitem")).toHaveCount(20);
    await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  });

  test("carregar mais traz a próxima página sem repetir lugares", async ({ page }) => {
    await page.goto("/lugares");
    const itens = page.getByRole("list", { name: "Lugares" }).getByRole("listitem");
    await expect(itens).toHaveCount(20);

    await page.getByRole("button", { name: "Carregar mais" }).click();
    await expect(itens).toHaveCount(40);

    const nomes = await itens.getByRole("heading").allTextContents();
    expect(new Set(nomes).size).toBe(40);
  });

  test("home leva para a lista de lugares", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Ver lugares" }).click();
    await expect(page).toHaveURL(/\/lugares$/);
  });

  test("API recusa cursor adulterado com 400", async ({ request }) => {
    const res = await request.get("/api/places?cursor=lixo");
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });
});
