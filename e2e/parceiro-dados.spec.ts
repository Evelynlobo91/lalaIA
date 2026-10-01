import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestEvent, createTestPlace, recordInteractions } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("painel de dados do promotor (#77/#78)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regras do painel não dependem da largura da tela");
  });

  test("6 indicadores com os números do parceiro, filtro por recurso e período, e gráfico em tabela", async ({ page }) => {
    const tag = `${Date.now()}`;
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const placeId = await createTestPlace(`Bar Dados ${tag}`);
    await assignPlaceTo(dono, placeId);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Dados ${tag}`, startsInHours: 24, durationHours: 2 });
    await recordInteractions("place", placeId, "view", 8);
    await recordInteractions("place", placeId, "quero_ir", 2);
    await recordInteractions("event", eventId, "view", 2);
    await recordInteractions("event", eventId, "favorite", 1);

    await loginAs(page, dono, "/parceiro/dados");
    const indicadores = page.getByRole("list", { name: "Indicadores" });
    await expect(indicadores.getByRole("listitem").filter({ hasText: "Visualizações" })).toContainText("10");
    await expect(indicadores.getByRole("listitem").filter({ hasText: "Favoritos" })).toContainText("1");
    await expect(indicadores.getByRole("listitem").filter({ hasText: "Conversão" })).toContainText("20%");
    await expect(page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: "30 dias" })).toHaveAttribute("aria-current", "true");

    // Filtro por recurso: só o evento.
    await page.getByLabel("Lugar, evento ou missão").selectOption(`event:${eventId}`);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(new RegExp(`recurso=event%3A${eventId}`));
    await expect(indicadores.getByRole("listitem").filter({ hasText: "Visualizações" })).toContainText("2");

    // Período e gráfico de outra métrica, com a tabela acessível.
    await page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: "7 dias" }).click();
    await expect(page).toHaveURL(/periodo=7/);
    await indicadores.getByRole("link", { name: /Favoritos/ }).click();
    await expect(page.getByRole("heading", { name: "Favoritos por dia" })).toBeVisible();
    await page.getByText("Ver em tabela").click();
    await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(8); // cabeçalho + 7 dias
  });

  test("recurso de outro parceiro não abre (404) e a API exige parceiro", async ({ page, request, browser }) => {
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const placeId = await createTestPlace(`Bar Alheio ${Date.now()}`);
    await assignPlaceTo(dono, placeId);

    expect((await request.get("/api/partner/dashboard")).status()).toBe(401);

    const outro = await createConfirmedUser();
    await createApprovedPartner(outro, "Outro Bar");
    await loginAs(page, outro, "/parceiro/dados");
    await expect(page.getByText("Ainda não há o que medir")).toBeVisible();
    expect((await page.goto(`/parceiro/dados?recurso=place:${placeId}`))?.status()).toBe(404);
    expect((await page.request.get(`/api/partner/dashboard?recurso=place:${placeId}`)).status()).toBe(404);
    expect((await page.request.get("/api/partner/dashboard?periodo=7")).status()).toBe(200);

    // Quem não é parceiro (outra sessão): 403.
    const contexto = await browser.newContext();
    const comumPage = await contexto.newPage();
    await loginAs(comumPage, await createConfirmedUser(), "/perfil");
    expect((await comumPage.request.get("/api/partner/dashboard")).status()).toBe(403);
    await contexto.close();
  });
});
