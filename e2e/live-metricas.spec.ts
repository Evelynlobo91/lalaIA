import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, interactionCounts } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("Live: métricas da transmissão no portal (#54)", () => {
  test("acessos à página aparecem no portal; sem dados de quem acessou", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Métricas ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);
    await createLiveStream(dono, "place", placeId);

    // Um visitante anônimo abre a página do lugar (TrackView registra um `view`).
    const visitante = await browser.newContext();
    const visita = await visitante.newPage();
    await visita.goto(`/lugares/${placeId}`);
    await expect(visita.getByRole("heading", { level: 1, name: placeName })).toBeVisible();
    await expect.poll(() => interactionCounts(placeId)).toMatchObject({ view: 1 });
    await visitante.close();

    await loginAs(page, dono, "/parceiro/live");
    const metricas = page.getByRole("list", { name: "Transmissões" }).getByLabel(`Métricas da transmissão de ${placeName}`);
    await expect(metricas).toBeVisible();
    await expect(metricas.getByText("Acessos à página")).toBeVisible();
    await expect(metricas.getByText("Assistiram")).toBeVisible();
    // Acessos: 1 no total e 1 nos últimos 7 dias; ninguém assistiu ainda.
    await expect(metricas.getByText("1 nos últimos 7 dias", { exact: true })).toBeVisible();
    await expect(metricas.getByText("0 nos últimos 7 dias", { exact: true })).toBeVisible();
    await expect(page.getByText("não registramos quem assistiu")).toBeVisible();
  });
});
