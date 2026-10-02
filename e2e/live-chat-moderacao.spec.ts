import { expect, test, type Page } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, isolatedPoint, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// O chat se atualiza por polling curto (~2,5 s).
const soon = { timeout: 15_000 };

const chatOf = (page: Page) => page.getByRole("region", { name: "Chat da live" });
async function say(page: Page, text: string) {
  const chat = chatOf(page);
  await chat.getByRole("textbox", { name: "Mensagem" }).fill(text);
  await chat.getByRole("button", { name: "Enviar mensagem" }).click();
}

test.describe("moderação do chat pelo anfitrião (#192)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo da moderação roda só no celular");
  });

  test("anfitrião fixa, apaga, silencia e bane; liga o modo lento e desliga o chat pelo portal", async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const lugar = `Bar Moderado ${Date.now()}`;
    const dono = await createConfirmedUser("Bar Moderado");
    await createApprovedPartner(dono, "Bar Moderado");
    const placeId = await createTestPlace(lugar, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const leo = await createConfirmedUser("Leo Falante");
    const rui = await createConfirmedUser("Rui Chato");

    const leoContext = await browser.newContext();
    const leoPage = await leoContext.newPage();
    await loginAs(leoPage, leo, `/lugares/${placeId}`);
    const ruiContext = await browser.newContext();
    const ruiPage = await ruiContext.newPage();
    await loginAs(ruiPage, rui, `/lugares/${placeId}`);
    await loginAs(page, dono, `/lugares/${placeId}`);
    const chat = chatOf(page);
    const log = chat.getByRole("log", { name: "Mensagens do chat" });

    // Fixar: a mensagem do anfitrião vai para o topo de todos.
    await say(page, "Happy hour até 20h");
    await expect(log).toContainText("Happy hour até 20h");
    await chat.getByRole("button", { name: "Opções da mensagem de Bar Moderado" }).click();
    await chat.getByRole("button", { name: "Fixar no topo" }).click();
    await expect(chat.getByRole("note", { name: "Mensagem fixada" })).toContainText("Happy hour até 20h");
    await expect(chatOf(leoPage).getByRole("note", { name: "Mensagem fixada" })).toContainText("Happy hour até 20h", soon);
    // Quem não modera não vê os controles do anfitrião: na mensagem dos outros, só "Denunciar".
    await chatOf(leoPage).getByRole("button", { name: "Opções da mensagem de Bar Moderado" }).click();
    const opcoesDoLeo = chatOf(leoPage).getByRole("group", { name: "Opções para a mensagem de Bar Moderado" });
    await expect(opcoesDoLeo.getByRole("button", { name: "Denunciar" })).toBeVisible();
    await expect(opcoesDoLeo.getByRole("button")).toHaveCount(1);
    await chatOf(leoPage).getByRole("button", { name: "Opções da mensagem de Bar Moderado" }).click();

    // Apagar: some para todos. O autor também apaga a própria.
    await say(leoPage, "mensagem que vai sumir");
    await expect(log).toContainText("mensagem que vai sumir", soon);
    await chat.getByRole("button", { name: "Opções da mensagem de Leo Falante" }).click();
    await chat.getByRole("button", { name: "Apagar mensagem" }).click();
    await expect(log).not.toContainText("mensagem que vai sumir");
    await expect(chatOf(leoPage).getByRole("log")).not.toContainText("mensagem que vai sumir", soon);

    await leoPage.waitForTimeout(3_200);
    await say(leoPage, "apago eu mesmo");
    await expect(chatOf(leoPage).getByRole("log")).toContainText("apago eu mesmo");
    await chatOf(leoPage).getByRole("button", { name: "Opções da mensagem de Leo Falante" }).click();
    await expect(chatOf(leoPage).getByRole("button", { name: "Banir do chat" })).toHaveCount(0);
    await chatOf(leoPage).getByRole("button", { name: "Apagar mensagem" }).click();
    await expect(chatOf(leoPage).getByRole("log")).not.toContainText("apago eu mesmo");

    // Silenciar: o Rui não consegue mais enviar (conferido no servidor).
    await say(ruiPage, "spam spam spam");
    await expect(log).toContainText("spam spam spam", soon);
    await chat.getByRole("button", { name: "Opções da mensagem de Rui Chato" }).click();
    await chat.getByRole("button", { name: "Silenciar por 5 min" }).click();
    await expect(chat.getByRole("status").filter({ hasText: "Rui Chato foi silenciado." })).toBeVisible();
    await ruiPage.waitForTimeout(3_200);
    await say(ruiPage, "mais spam");
    await expect(chatOf(ruiPage).getByRole("alert")).toContainText(/Você foi silenciado neste chat até \d{2}:\d{2}\./);
    await expect(log).not.toContainText("mais spam");

    // Banir: vira banimento dos chats do parceiro.
    await chat.getByRole("button", { name: "Opções da mensagem de Rui Chato" }).click();
    await chat.getByRole("button", { name: "Banir do chat" }).click();
    await expect(chat.getByRole("status").filter({ hasText: "Rui Chato foi banido do chat." })).toBeVisible();
    await say(ruiPage, "e agora?");
    await expect(chatOf(ruiPage).getByRole("alert")).toHaveText("Você não pode participar deste chat.");

    // Portal: a lista mostra silenciado e banido; o anfitrião desbane.
    const portalContext = await browser.newContext();
    const portal = await portalContext.newPage();
    await loginAs(portal, dono, "/parceiro/live");
    const restricoes = portal.getByRole("list", { name: "Silenciados e banidos do chat" });
    await expect(restricoes).toContainText("Rui Chato");
    await expect(restricoes).toContainText("banido dos seus chats");
    await expect(restricoes).toContainText("silenciado até");
    await restricoes.getByRole("button", { name: "Desbanir Rui Chato" }).click();
    await expect(restricoes.getByRole("button", { name: "Desbanir Rui Chato" })).toHaveCount(0);
    await restricoes.getByRole("button", { name: "Tirar o silêncio de Rui Chato" }).click();
    await expect(portal.getByRole("list", { name: "Silenciados e banidos do chat" })).toHaveCount(0);
    await say(ruiPage, "voltei educado");
    await expect(log).toContainText("voltei educado", soon);

    // Modo lento: a tela avisa e o servidor segura a segunda mensagem.
    const opcoes = portal.getByRole("form", { name: `Chat da transmissão de ${lugar}` });
    await opcoes.locator('select[name="slowSeconds"]').selectOption("30");
    await opcoes.getByRole("button", { name: `Salvar o chat de ${lugar}` }).click();
    await expect(opcoes.getByRole("status")).toHaveText("Chat atualizado.");
    await expect(chatOf(leoPage).getByText("Modo lento: 1 mensagem a cada 30 s.")).toBeVisible(soon);
    // A última mensagem do Leo foi há mais de 3 s (o intervalo padrão), mas há menos de 30 s: só o modo lento a segura.
    await say(leoPage, "cedo demais para o modo lento");
    await expect(chatOf(leoPage).getByRole("alert")).toContainText(/Aguarde \d{1,2} s para enviar outra mensagem\./);
    // O anfitrião não é afetado pelo modo lento.
    await say(page, "aviso do anfitrião");
    await page.waitForTimeout(3_200);
    await say(page, "outro aviso em seguida");
    await expect(log).toContainText("outro aviso em seguida");

    // Desligar o chat: fecha para todos, e as reações continuam.
    await opcoes.locator('select[name="chatEnabled"]').selectOption("off");
    await opcoes.getByRole("button", { name: `Salvar o chat de ${lugar}` }).click();
    await expect(opcoes.getByRole("status")).toHaveText("Chat atualizado.");
    await expect(chatOf(leoPage).getByText("O anfitrião desligou o chat desta live.")).toBeVisible(soon);
    await expect(chatOf(leoPage).getByRole("form", { name: "Enviar mensagem no chat" })).toHaveCount(0);
    await expect(leoPage.getByRole("group", { name: "Reações rápidas" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    expect(await portal.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    await Promise.all([leoContext.close(), ruiContext.close(), portalContext.close()]);
  });

  test("quem não modera não consegue moderar pelo endpoint", async ({ page, request }) => {
    const dono = await createConfirmedUser("Bar Protegido");
    await createApprovedPartner(dono, "Bar Protegido");
    const placeId = await createTestPlace(`Bar Protegido ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const leo = await createConfirmedUser("Leo Curioso");

    await loginAs(page, dono, `/lugares/${placeId}`);
    await say(page, "mensagem do anfitrião");
    await expect(chatOf(page).getByRole("log")).toContainText("mensagem do anfitrião");
    const feed = await (await request.get(`/api/live/chat?streamId=${stream.id}`)).json();
    const messageId = feed.messages[0].id as string;

    expect((await request.post("/api/live/chat/moderation", { data: { messageId, action: "delete" } })).status()).toBe(401);
    await page.context().clearCookies();
    await loginAs(page, leo, `/lugares/${placeId}`);
    for (const action of ["delete", "pin", "ban", "mute5"]) {
      expect((await page.request.post("/api/live/chat/moderation", { data: { messageId, action } })).status(), action).toBe(403);
    }
    await expect(chatOf(page).getByRole("log")).toContainText("mensagem do anfitrião");
  });
});
