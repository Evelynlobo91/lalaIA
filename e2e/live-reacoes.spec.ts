import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, isolatedPoint, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// O pulso (espectadores, curtidas e reações) bate a cada ~5 s; o chat se atualiza a cada ~2,5 s.
const pulse = { timeout: 20_000 };

test.describe("curtidas, reações e espectadores da live (#189, #190, #191)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo das reações roda só no celular");
  });

  test("curtida e reações de uma pessoa aparecem para a outra; o contador de espectadores acompanha as abas", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const dono = await createConfirmedUser("Bar das Reações");
    await createApprovedPartner(dono, "Bar das Reações");
    const placeId = await createTestPlace(`Bar das Reações ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const leo = await createConfirmedUser("Leo Reage");

    // Visitante: vê os contadores, mas é convidado a entrar para curtir ou reagir.
    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.getByText("1 assistindo")).toBeVisible(pulse);
    await live.getByRole("button", { name: "Curtir a live" }).click();
    await expect(live.getByRole("status").filter({ hasText: "Entre para curtir e reagir." })).toBeVisible();
    await expect(live.getByRole("button", { name: "Curtir a live" })).toHaveAttribute("aria-pressed", "false");

    // Leo entra: são duas abas assistindo, e a curtida dele aparece para o visitante.
    const context = await browser.newContext();
    const leoPage = await context.newPage();
    await loginAs(leoPage, leo, `/lugares/${placeId}`);
    const leoLive = leoPage.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(leoLive.getByText("2 assistindo")).toBeVisible(pulse);
    await expect(live.getByText("2 assistindo")).toBeVisible(pulse);

    await leoLive.getByRole("button", { name: "Curtir a live" }).click();
    await expect(leoLive.getByRole("button", { name: "Descurtir a live" })).toHaveAttribute("aria-pressed", "true");
    await expect(leoLive.getByLabel("1 curtidas")).toBeVisible();
    await expect(live.getByLabel("1 curtidas")).toBeVisible(pulse);

    // Reações: o emoji de quem reagiu flutua na hora; o dos outros chega no pulso seguinte.
    const reacoes = leoLive.getByRole("group", { name: "Reações rápidas" });
    await reacoes.getByRole("button", { name: "Reagir: Pegando fogo" }).click();
    await reacoes.getByRole("button", { name: "Reagir: Pegando fogo" }).click();
    await reacoes.getByRole("button", { name: "Reagir: Brinde" }).click();
    await expect(leoLive.locator(".live-reaction-float").first()).toBeAttached();
    await expect(live.locator(".live-reaction-float").first()).toBeAttached(pulse);
    await expect
      .poll(async () => (await (await request.post("/api/live/pulse", { data: { streamId: stream.id, viewerId: "e2e-aba-000000000001" } })).json()).reactions, pulse)
      .toMatchObject({ fire: 2, cheers: 1, heart: 0 });

    // Recarregar mantém a curtida da pessoa; descurtir zera para todos.
    await leoPage.reload();
    await expect(leoLive.getByRole("button", { name: "Descurtir a live" })).toBeVisible(pulse);

    // Curtir mensagem do chat: o contador aparece para o visitante.
    const leoChat = leoPage.getByRole("region", { name: "Chat da live" });
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("Brinde pra casa!");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    await leoChat.getByRole("button", { name: "Curtir a mensagem de Leo Reage" }).click();
    await expect(leoChat.getByRole("button", { name: "Descurtir a mensagem de Leo Reage" })).toContainText("1");
    const chat = page.getByRole("region", { name: "Chat da live" });
    await expect(chat.getByLabel("1 curtidas")).toBeVisible(pulse);

    await leoLive.getByRole("button", { name: "Descurtir a live" }).click();
    await expect(live.getByLabel("0 curtidas")).toBeVisible(pulse);
    expect(await leoPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    // O parceiro vê no portal quantos estão assistindo agora.
    const donoContext = await browser.newContext();
    const donoPage = await donoContext.newPage();
    await loginAs(donoPage, dono, "/parceiro/live");
    // As duas abas abertas (o visitante e o Leo); a consulta direta ao pulso acima pode ainda estar na janela.
    await expect(donoPage.getByText("assistindo agora")).toContainText(/^[23] assistindo agora/);

    // Aba fechada deixa de contar.
    await context.close();
    await expect(live.getByText("1 assistindo")).toBeVisible({ timeout: 40_000 });
    await donoContext.close();
  });

  test("visitante não curte nem reage pelo endpoint (401); sem o recurso no plano, o pulso vem zerado", async ({ request }) => {
    const dono = await createConfirmedUser("Bar Sem Reações");
    await createApprovedPartner(dono, "Bar Sem Reações");
    const placeId = await createTestPlace(`Bar Sem Reações ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    expect((await request.post("/api/live/likes", { data: { streamId: stream.id } })).status()).toBe(401);
    expect((await request.post("/api/live/reactions", { data: { streamId: stream.id, counts: { fire: 1 } } })).status()).toBe(401);
    const beat = await request.post("/api/live/pulse", { data: { streamId: stream.id, viewerId: "e2e-aba-000000000002" } });
    expect(await beat.json()).toMatchObject({ viewers: 0, likes: 0 });
    expect((await request.post("/api/live/pulse", { data: { streamId: stream.id, viewerId: "x" } })).status()).toBe(400);
  });
});
