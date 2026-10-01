import { expect, test } from "@playwright/test";
import {
  assignPlaceTo,
  createApprovedPartner,
  createLiveStream,
  createTestEvent,
  createTestPlace,
  interactionCounts,
  lifecycleCount,
  liveStreamOf,
  setLiveControl,
} from "./support/db";
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

  test("parceiro pausa, ativa e encerra a transmissão no portal (#49)", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Controle ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);
    await loginAs(page, dono, "/parceiro/live");
    const card = page.getByRole("listitem").filter({ hasText: placeName });
    await card.getByRole("button", { name: `Gerar chave de transmissão para ${placeName}` }).click();
    await expect(card.getByText("Aguardando sinal")).toBeVisible();
    const stream = (await liveStreamOf(placeId))!;
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    await page.reload();
    await expect(card.getByText("Ao vivo")).toBeVisible();

    await card.getByRole("button", { name: `Pausar a transmissão de ${placeName}` }).click();
    await expect(card.getByText("Pausada", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: `Ativar a transmissão de ${placeName}` }).click();
    await expect(card.getByText("Ao vivo")).toBeVisible();

    await card.getByRole("button", { name: `Encerrar a transmissão de ${placeName}` }).click();
    await card.getByRole("button", { name: "Sim, encerrar" }).click();
    await expect(card.getByText("Encerrada")).toBeVisible();
    expect((await liveStreamOf(placeId))!.status).toBe("ended");
    // Log de ciclo de vida: active (provedor) + paused, activated, ended (parceiro).
    expect(await lifecycleCount(stream.id)).toBe(4);
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

test.describe("Live: player na página do lugar e do evento (#50)", () => {
  test("live no ar aparece no lugar: mudo, inline, e assistir registra live_view", async ({ page, request }) => {
    const placeName = `Bar Player ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);

    // Sem sinal ainda: nada de vídeo.
    await page.goto(`/lugares/${placeId}`);
    await expect(page.getByRole("heading", { level: 1, name: placeName })).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);

    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    await page.reload();
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.getByText("Ao vivo")).toBeVisible();
    const video = live.locator("video");
    await expect(video).toHaveJSProperty("muted", true);
    await expect(video).toHaveAttribute("playsinline", "");

    // O vídeo de teste é externo (test-streams.mux.dev): só confere o live_view se ele chegar a tocar.
    const played = await video.evaluate(
      (v: HTMLVideoElement) =>
        new Promise<boolean>((resolve) => {
          if (!v.paused && v.readyState > 2) return resolve(true);
          v.addEventListener("playing", () => resolve(true), { once: true });
          setTimeout(() => resolve(false), 15_000);
        }),
    );
    if (played) await expect.poll(() => interactionCounts(stream.id)).toMatchObject({ live_view: 1 });
  });

  test("live do evento aparece na página do evento", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "o layout já é coberto no teste do lugar");
    const placeId = await createTestPlace(`Palco Player ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show ao vivo ${Date.now()}`, startsInHours: -1, durationHours: 3 });
    const stream = await createLiveStream(dono, "event", eventId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    await page.goto(`/eventos/${eventId}`);
    await expect(page.getByRole("region", { name: "Transmissão ao vivo" }).locator("video")).toBeVisible();
  });
});

test.describe("Live: estados sem recarregar a página (#51)", () => {
  // O polling roda a cada ~12 s: cada transição pode levar até um ciclo.
  const cycle = { timeout: 20_000 };

  test("aguardando sinal → ao vivo → pausada → ao vivo → encerrada, sem recarregar", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "transições não dependem da largura da tela");
    test.setTimeout(120_000);
    const placeName = `Bar Estados ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);

    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.getByText("Aguardando sinal")).toBeVisible();

    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    await expect(live.locator("video")).toBeVisible(cycle);
    await expect(live.getByText("Ao vivo")).toBeVisible();

    await setLiveControl(stream.id, "paused");
    await expect(live.getByText("Transmissão pausada")).toBeVisible(cycle);
    await expect(live.locator("video")).toHaveCount(0);

    await setLiveControl(stream.id, "on");
    await expect(live.locator("video")).toBeVisible(cycle);

    await setLiveControl(stream.id, "ended");
    await expect(live.getByText("Transmissão encerrada")).toBeVisible(cycle);
    await expect(live.locator("video")).toHaveCount(0);

    // Quem chega depois do fim não vê o bloco da live.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: placeName })).toBeVisible();
    await expect(live).toHaveCount(0);
  });

  test("erro do player mostra 'indisponível' com opção de tentar de novo", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "estado não depende da largura da tela");
    const placeId = await createTestPlace(`Bar Sem Sinal ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    // Simula a stream HLS fora do ar.
    await page.route(/\.m3u8(\?.*)?$/, (route) => route.abort());
    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.getByText("Transmissão indisponível")).toBeVisible(cycle);
    await expect(live.getByRole("button", { name: "Tentar de novo" })).toBeVisible();

    await page.unroute(/\.m3u8(\?.*)?$/);
    await live.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(live.locator("video")).toBeVisible();
  });
});
