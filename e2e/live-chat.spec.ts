import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, isolatedPoint, setLiveControl, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// O chat se atualiza por polling curto (~2,5 s) e o status da live a cada ~12 s.
const soon = { timeout: 15_000 };
const cycle = { timeout: 30_000 };

async function liveWithChat(request: Parameters<typeof sendLiveWebhook>[0], opts: { plan?: boolean } = {}) {
  const dono = await createConfirmedUser("Bar do Chat");
  await createApprovedPartner(dono, "Bar do Chat");
  const placeId = await createTestPlace(`Bar do Chat ${Date.now()}`, isolatedPoint());
  await assignPlaceTo(dono, placeId);
  if (opts.plan !== false) await subscribeToPlan(dono, "pro");
  const stream = await createLiveStream(dono, "place", placeId);
  await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
  return { dono, placeId, stream };
}

test.describe("chat da live (#187, #188)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo do chat roda só no celular");
  });

  test("dois navegadores conversam: a mensagem aparece para o outro sem recarregar; o anfitrião responde com selo", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const { dono, placeId, stream } = await liveWithChat(request);
    const leo = await createConfirmedUser("Leo Explorador");

    // Visitante lê, mas precisa entrar para escrever.
    await page.goto(`/lugares/${placeId}`);
    const chat = page.getByRole("region", { name: "Chat da live" });
    await expect(chat.getByText("Ninguém escreveu ainda. Comece a conversa.")).toBeVisible(soon);
    await expect(chat.getByRole("form", { name: "Enviar mensagem no chat" })).toHaveCount(0);
    await expect(chat.getByRole("link", { name: "Entre para participar" })).toHaveAttribute("href", `/entrar?next=${encodeURIComponent(`/lugares/${placeId}`)}`);

    // Leo entra e escreve.
    const leoContext = await browser.newContext();
    const leoPage = await leoContext.newPage();
    await loginAs(leoPage, leo, `/lugares/${placeId}`);
    const leoChat = leoPage.getByRole("region", { name: "Chat da live" });
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("Que som bom! Chego em 10 min");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    const leoLog = leoChat.getByRole("log", { name: "Mensagens do chat" });
    await expect(leoLog).toContainText("Que som bom! Chego em 10 min");
    await expect(leoLog).toContainText("Leo Explorador");
    await expect(leoLog).toContainText("Nível 1");
    await expect(leoChat.getByRole("textbox", { name: "Mensagem" })).toHaveValue("");

    // O visitante vê a mensagem chegar sozinha.
    const log = chat.getByRole("log", { name: "Mensagens do chat" });
    await expect(log).toContainText("Que som bom! Chego em 10 min", soon);

    // O anfitrião responde citando a mensagem; aparece com o selo para todos.
    const donoContext = await browser.newContext();
    const donoPage = await donoContext.newPage();
    await loginAs(donoPage, dono, `/lugares/${placeId}`);
    const donoChat = donoPage.getByRole("region", { name: "Chat da live" });
    await donoChat.getByRole("button", { name: "Responder a Leo Explorador" }).click();
    await expect(donoChat.getByText("Respondendo a Leo Explorador")).toBeVisible();
    await donoChat.getByRole("textbox", { name: "Mensagem" }).fill("Te esperamos! Cardápio em https://instagram.com/bardochat");
    await donoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    const resposta = log.getByRole("listitem").filter({ hasText: "Te esperamos!" });
    await expect(resposta).toBeVisible(soon);
    await expect(resposta).toContainText("Anfitrião");
    await expect(resposta).toContainText("Leo Explorador: Que som bom! Chego em 10 min");
    await expect(leoLog).toContainText("Te esperamos!", soon);

    // Regras conferidas no servidor: intervalo entre mensagens, link e ofensa.
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("primeira");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(leoLog).toContainText("primeira");
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("segunda logo em seguida");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(leoChat.getByRole("alert")).toContainText(/Aguarde \d s para enviar outra mensagem\./);
    await expect(leoChat.getByRole("textbox", { name: "Mensagem" })).toHaveValue("segunda logo em seguida");

    await leoPage.waitForTimeout(3_200);
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("entra em www.golpe.com");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(leoChat.getByRole("alert")).toHaveText("Links não são permitidos no chat.");
    await leoChat.getByRole("textbox", { name: "Mensagem" }).fill("que merda de som");
    await leoChat.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(leoChat.getByRole("alert")).toHaveText("Mensagem bloqueada: mantenha o respeito no chat.");
    await expect(log).not.toContainText("golpe");
    await expect(log).not.toContainText("merda");

    // Não alarga a página no celular e pode ser recolhido.
    expect(await leoPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await leoChat.getByRole("button", { name: /^Chat/ }).click();
    await expect(leoLog).toBeHidden();

    // Quem entra depois recebe o histórico; pausada, o chat fecha para todos.
    await page.reload();
    await expect(log).toContainText("Que som bom! Chego em 10 min", soon);
    await setLiveControl(stream.id, "paused");
    await expect(page.getByText("Transmissão pausada")).toBeVisible(cycle);
    await expect(chat).toHaveCount(0);

    await Promise.all([leoContext.close(), donoContext.close()]);
  });

  test("sem o chat no plano do anfitrião, a live aparece sem chat e o envio é recusado", async ({ page, request }) => {
    const { placeId, stream } = await liveWithChat(request, { plan: false });
    const leo = await createConfirmedUser("Leo Sem Chat");
    await loginAs(page, leo, `/lugares/${placeId}`);
    await expect(page.getByRole("region", { name: "Transmissão ao vivo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Chat da live" })).toHaveCount(0);

    const response = await page.request.post("/api/live/chat", { data: { streamId: stream.id, body: "oi" } });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe("chat_closed");
  });

  test("visitante não envia pelo endpoint (401)", async ({ request }) => {
    const { stream } = await liveWithChat(request);
    const response = await request.post("/api/live/chat", { data: { streamId: stream.id, body: "oi" } });
    expect(response.status()).toBe(401);
    const feed = await request.get(`/api/live/chat?streamId=${stream.id}`);
    expect(feed.status()).toBe(200);
    expect(await feed.json()).toMatchObject({ open: true, messages: [] });
  });
});
