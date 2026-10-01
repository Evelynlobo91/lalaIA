import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace, interactionCounts } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("tracking de interações (#76)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "registro não depende da largura da tela");
  });

  test("abrir o lugar registra view (uma vez por aba) e favoritar registra favorite", async ({ page }) => {
    const placeId = await createTestPlace(`Café Métricas ${Date.now()}`);
    const pessoa = await createConfirmedUser();
    await loginAs(page, pessoa, "/perfil");

    const beacon = page.waitForResponse((r) => r.url().endsWith("/api/analytics/track") && r.request().method() === "POST");
    await page.goto(`/lugares/${placeId}`);
    expect((await beacon).status()).toBe(202);
    await expect.poll(() => interactionCounts(placeId)).toEqual({ view: 1 });

    // Recarregar na mesma aba não conta de novo.
    await page.reload();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Favoritar" }).click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => interactionCounts(placeId)).toEqual({ view: 1, favorite: 1 });
  });

  test("abrir o evento registra view do evento", async ({ page }) => {
    const placeId = await createTestPlace(`Palco Métricas ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Métricas ${Date.now()}`, startsInHours: 24, durationHours: 2 });

    await page.goto(`/eventos/${eventId}`);
    await expect.poll(() => interactionCounts(eventId)).toEqual({ view: 1 });
  });

  test("o endpoint só aceita visualizações válidas", async ({ request }) => {
    // Lugar de teste (a limpeza do fim da execução apaga as interações dele).
    const id = await createTestPlace(`Endpoint Métricas ${Date.now()}`);
    expect((await request.post("/api/analytics/track", { data: { kind: "view", entityType: "place", entityId: id } })).status()).toBe(202);
    expect((await request.post("/api/analytics/track", { data: { kind: "favorite", entityType: "place", entityId: id } })).status()).toBe(400);
    expect((await request.post("/api/analytics/track", { data: { kind: "view", entityType: "place", entityId: "x" } })).status()).toBe(400);
    await expect.poll(() => interactionCounts(id)).toEqual({ view: 1 });
  });
});
