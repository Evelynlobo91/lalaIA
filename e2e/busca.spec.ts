import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { findInPagedList } from "./support/lists";
import { createConfirmedUser } from "./support/users";

test.describe("busca unificada (#42)", () => {
  test("digitar sem acento acha lugares e eventos, agrupados por tipo", async ({ page }) => {
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Açaí Busca ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Roda de Samba Busca ${tag}`, startsInHours: 24, durationHours: 3 });

    await page.goto("/buscar");
    const campo = page.getByRole("searchbox", { name: "Buscar lugares e eventos" });
    // Debounce: a URL e os resultados mudam sozinhos, sem apertar "Buscar".
    await campo.fill(`acai busca ${tag}`);
    await expect(page).toHaveURL(new RegExp(`q=acai\\+busca\\+${tag}`));
    await expect(campo).toBeFocused();

    const lugares = page.getByRole("list", { name: "Lugares encontrados" });
    await expect(lugares.getByRole("link", { name: new RegExp(`Açaí Busca ${tag}`) })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Eventos" })).toBeVisible();
    await expect(page.getByText("Nenhum evento encontrado.")).toBeVisible();

    await campo.fill(`samba busca ${tag}`);
    const eventos = page.getByRole("list", { name: "Eventos encontrados" });
    await expect(eventos.getByRole("link", { name: new RegExp(`Roda de Samba Busca ${tag}`) })).toBeVisible();
    await expect(eventos.getByText(`Açaí Busca ${tag}`)).toBeVisible(); // onde acontece
  });

  test("aba Lugares mantém a busca e o link leva ao detalhe", async ({ page }) => {
    const tag = `${Date.now()}`;
    await createTestPlace(`Café Aba ${tag}`);
    await page.goto(`/buscar?q=${encodeURIComponent(`cafe aba ${tag}`)}`);

    const abas = page.getByRole("navigation", { name: "Tipo de resultado" });
    await expect(abas.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "true");
    await abas.getByRole("link", { name: "Lugares" }).click();
    await expect(page).toHaveURL(/tipo=lugares/);
    await expect(abas.getByRole("link", { name: "Lugares" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { level: 2, name: "Eventos" })).toHaveCount(0);

    const item = await findInPagedList(page, page.getByRole("list", { name: "Lugares encontrados" }), `Café Aba ${tag}`);
    await item.getByRole("link").click();
    await expect(page).toHaveURL(/\/lugares\/[0-9a-f-]{36}$/);
  });

  test("home leva para a busca; sem texto mostra a dica", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Buscar lugares e eventos" }).fill("museu");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/buscar\?q=museu$/);

    await page.goto("/buscar?q=a");
    await expect(page.getByText("Digite pelo menos 2 letras.")).toBeVisible();
  });

  test("API valida a entrada", async ({ request }) => {
    expect((await request.get("/api/discovery/search")).status()).toBe(400);
    expect((await request.get("/api/discovery/search?q=bar&cursor=abc")).status()).toBe(400);
    expect((await request.get("/api/discovery/search?q=bar&tipo=lugares&cursor=lixo")).status()).toBe(400);
    const ok = await request.get("/api/discovery/search?q=bar");
    expect(ok.status()).toBe(200);
    expect((await ok.json()).groups.map((g: { kind: string }) => g.kind)).toEqual(["lugares", "eventos"]);
  });
});
