import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestPlace, lifecycleCount, liveStreamOf } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("Live: chave de transmissão (#47)", () => {
  test("parceiro gera, revela, copia e rotaciona a chave do próprio lugar", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Live ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser("Dono da Live");
    await createApprovedPartner(dono, "Bar da Live");
    await assignPlaceTo(dono, placeId);

    await loginAs(page, dono, "/parceiro/live");
    await expect(page.getByRole("heading", { level: 1, name: "Live" })).toBeVisible();
    await expect(page.getByText("rtmps://global-live.mux.com:443/app").first()).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Privacidade" })).toBeVisible();

    const card = page.getByRole("listitem").filter({ hasText: placeName });
    await card.getByRole("button", { name: `Gerar chave de transmissão para ${placeName}` }).click();
    await expect(card.getByText("Aguardando sinal")).toBeVisible();

    // Mascarada por padrão: a chave não está no HTML da página.
    const stream = await liveStreamOf(placeId);
    expect(stream).not.toBeNull();
    expect(await page.content()).not.toContain(stream!.streamKey);
    const key = card.locator('output[aria-label="Chave de transmissão"]');
    await expect(key).toHaveText(/^•+$/);

    await card.getByRole("button", { name: "Revelar chave" }).click();
    await expect(key).toHaveText(stream!.streamKey);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await card.getByRole("button", { name: "Copiar chave" }).click();
    await expect(card.getByText("Chave copiada.")).toBeVisible();

    await card.getByRole("button", { name: "Gerar nova chave" }).click();
    await card.getByRole("button", { name: "Sim, gerar nova" }).click();
    await expect(card.getByText(/Nova chave gerada/)).toBeVisible();
    const rotated = await liveStreamOf(placeId);
    expect(rotated!.streamKey).not.toBe(stream!.streamKey);
    await expect(key).toHaveText(/^•+$/);
  });

  test("webhook assinado muda o status no portal; assinatura inválida é recusada; reenvio é idempotente (#48)", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Webhook ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);
    await loginAs(page, dono, "/parceiro/live");
    const card = page.getByRole("listitem").filter({ hasText: placeName });
    await card.getByRole("button", { name: `Gerar chave de transmissão para ${placeName}` }).click();
    await expect(card.getByText("Aguardando sinal")).toBeVisible();
    const stream = (await liveStreamOf(placeId))!;

    const forged = await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active", { secret: "segredo-errado-de-quem-tenta-forjar-o-webhook" });
    expect(forged.status()).toBe(401);
    expect((await liveStreamOf(placeId))!.status).toBe("waiting");

    const eventId = crypto.randomUUID();
    expect((await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active", { eventId })).status()).toBe(200);
    expect((await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active", { eventId })).status()).toBe(200);
    expect(await lifecycleCount(stream.id)).toBe(1);
    await page.reload();
    await expect(card.getByText("Ao vivo")).toBeVisible();
  });

  test("outro parceiro não vê o lugar alheio no portal", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Alheio ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);

    const outro = await createConfirmedUser();
    await createApprovedPartner(outro, "Outro Bar");
    await loginAs(page, outro, "/parceiro/live");
    await expect(page.getByText("Nada para transmitir ainda")).toBeVisible();
    await expect(page.getByText(placeName)).toHaveCount(0);
  });
});
