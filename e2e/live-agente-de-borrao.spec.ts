import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, grantRole, isolatedPoint, liveStreamOf } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// O status da live chega pelo polling (~12 s).
const cycle = { timeout: 30_000 };
const beat = { privacy_mode: "on", blur_mode: "faces", fps: 29.5, faces_per_frame: 1.2, detector_status: "ok", sent_at: Date.now() / 1000 };

test.describe("agente de borrão de rostos: heartbeat na plataforma (#198)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo do agente roda só no celular");
  });

  test("sem CRON_SECRET no ambiente de teste, a checagem agendada de consumo fica desligada", async ({ request }) => {
    expect((await request.post("/api/live/scale/check")).status()).toBe(503);
    expect((await request.post("/api/live/scale/check", { headers: { authorization: "Bearer qualquer" } })).status()).toBe(503);
  });

  test("com o agente protegendo, o público vê 'rostos desfocados'; privacidade desligada pausa a live", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const lugar = `Bar com Agente ${Date.now()}`;
    const dono = await createConfirmedUser("Dona do Agente");
    await createApprovedPartner(dono, "Bar com Agente");
    const placeId = await createTestPlace(lugar, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    const stream = await createLiveStream(dono, "place", placeId);
    const { streamKey } = (await liveStreamOf(placeId))!;
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const auth = { authorization: `Bearer ${streamKey}` };

    // Sem agente: a live vai ao ar (vale a declaração do parceiro) e não promete o borrão automático.
    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.locator("video")).toBeVisible();
    await expect(live.getByText("Rostos desfocados automaticamente.")).toHaveCount(0);

    // Chave errada (ou nenhuma) é recusada; corpo fora do contrato também.
    expect((await request.post("/api/live/agent/heartbeat", { data: beat, headers: { authorization: "Bearer chave-errada-1234567890" } })).status()).toBe(401);
    expect((await request.post("/api/live/agent/heartbeat", { data: beat })).status()).toBe(401);
    expect((await request.post("/api/live/agent/heartbeat", { data: { ...beat, fps: -3 }, headers: auth })).status()).toBe(400);

    // O agente conecta: o aviso aparece para quem assiste, sem recarregar.
    const ok = await request.post("/api/live/agent/heartbeat", { data: beat, headers: auth });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ status: "protected", paused: false });
    await expect(live.getByText("Rostos desfocados automaticamente.")).toBeVisible(cycle);

    // Portal do parceiro e backoffice mostram o agente ativo.
    const donoContext = await browser.newContext();
    const portal = await donoContext.newPage();
    await loginAs(portal, dono, "/parceiro/live");
    await expect(portal.getByLabel(`Agente de borrão de ${lugar}`)).toContainText("Agente de borrão ativo: rostos desfocados");
    const moderador = await createConfirmedUser("Moderação das Lives");
    await grantRole(moderador, "moderator");
    const modContext = await browser.newContext();
    const admin = await modContext.newPage();
    await loginAs(admin, moderador, "/admin/conteudo");
    await admin.getByRole("link", { name: "Lives no ar" }).click();
    const linha = admin.getByRole("article", { name: `Live de ${lugar}` });
    await expect(linha).toContainText("Rostos desfocados");
    // Dimensionamento (#56): a mesma tela mostra a carga e o consumo das lives.
    const carga = admin.getByRole("region", { name: "Carga e consumo das lives" });
    await expect(carga).toContainText("Lives no ar");
    await expect(carga).toContainText("Minutos entregues no mês");
    expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    // O agente avisa que o modo privacidade foi desligado: a plataforma pausa a live.
    const off = await request.post("/api/live/agent/heartbeat", { data: { ...beat, privacy_mode: "off" }, headers: auth });
    expect(await off.json()).toEqual({ status: "off", paused: true });
    await expect(live.getByText("Transmissão pausada")).toBeVisible(cycle);
    await portal.reload();
    await expect(portal.getByLabel(`Agente de borrão de ${lugar}`)).toContainText("modo privacidade está desligado: a transmissão foi pausada");
    await expect(portal.getByRole("listitem").filter({ hasText: lugar }).getByText("Pausada", { exact: true })).toBeVisible();
    expect(await portal.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    await Promise.all([donoContext.close(), modContext.close()]);
  });
});
