import { expect, test } from "@playwright/test";
import { createApprovedPartner, createLiveStream, createTestEvent, createTestPlace, setLiveControl } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { createConfirmedUser } from "./support/users";

// O selo se atualiza por polling (~30 s): cada transição pode levar até um ciclo.
const cycle = { timeout: 45_000 };

test.describe("Live: selo 'Ao vivo', lista e mapa (#52)", () => {
  test("lista 'Com live agora' mostra lugar e evento no ar, com link para a página do player", async ({ page, request }) => {
    const placeName = `Bar Com Live ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventTitle = `Show Com Live ${Date.now()}`;
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: eventTitle, startsInHours: -1, durationHours: 3 });
    const placeStream = await createLiveStream(dono, "place", placeId);
    const eventStream = await createLiveStream(dono, "event", eventId);

    // Aguardando sinal ainda não é "ao vivo".
    await page.goto("/ao-vivo");
    await expect(page.getByRole("heading", { level: 1, name: "Com live agora" })).toBeVisible();
    await expect(page.getByText(placeName)).toHaveCount(0);

    await sendLiveWebhook(request, placeStream.providerStreamId, "video.live_stream.active");
    await sendLiveWebhook(request, eventStream.providerStreamId, "video.live_stream.active");
    await page.reload();
    const lista = page.getByRole("list", { name: "Com live agora" });
    const card = lista.locator(`a[href="/lugares/${placeId}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByText("Ao vivo", { exact: true })).toBeVisible();
    await expect(lista.getByRole("link", { name: new RegExp(eventTitle) })).toHaveAttribute("href", `/eventos/${eventId}`);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/lugares/${placeId}$`));
    await expect(page.getByRole("region", { name: "Transmissão ao vivo" }).locator("video")).toBeVisible();
  });

  test("selo no detalhe aparece e some sozinho, sem recarregar", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "transições não dependem da largura da tela");
    test.setTimeout(150_000);
    const placeName = `Bar Selo ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);

    await page.goto(`/lugares/${placeId}`);
    const cabecalho = page.locator("header", { has: page.getByRole("heading", { level: 1 }) });
    await expect(page.getByRole("heading", { level: 1, name: placeName })).toBeVisible();
    await expect(cabecalho.getByText("Ao vivo", { exact: true })).toHaveCount(0);

    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    await expect(cabecalho.getByText("Ao vivo", { exact: true })).toBeVisible(cycle);

    await setLiveControl(stream.id, "ended");
    await expect(cabecalho.getByText("Ao vivo", { exact: true })).toHaveCount(0, cycle);
  });

  test("camada Live do mapa: GeoJSON com a live no ar e link 'Com live agora'", async ({ page, request }) => {
    const placeName = `Bar Mapa Live ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    const geo = await (await request.get("/api/live/map")).json();
    const feature = geo.features.find((f: { id: string }) => f.id === stream.id);
    expect(feature.properties).toEqual({ streamId: stream.id, entityType: "place", title: placeName, subtitle: null, href: `/lugares/${placeId}` });
    expect(JSON.stringify(geo)).not.toContain("chave");

    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto("/mapa");
    await expect(page.getByRole("region", { name: "Mapa de lugares de Joinville" })).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Com live agora" })).toHaveAttribute("href", "/ao-vivo");
    expect(erros).toEqual([]);
  });

  test("/api/live/active lista só tipo e id das lives no ar", async ({ request }) => {
    const placeId = await createTestPlace(`Bar Active ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    const body = await (await request.get("/api/live/active")).json();
    expect(body.streams).toContainEqual({ entityType: "place", entityId: placeId });
    expect(Object.keys(body.streams[0]).sort()).toEqual(["entityId", "entityType"]);
  });
});
