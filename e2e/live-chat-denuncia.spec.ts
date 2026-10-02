import { expect, test, type Page } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, grantRole, isolatedPoint, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

const soon = { timeout: 15_000 };
const chatOf = (page: Page) => page.getByRole("region", { name: "Chat da live" });

test.describe("denúncia de mensagem do chat (#193)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo da denúncia roda só no celular");
  });

  test("espectador denuncia, a moderação vê na fila, apaga a mensagem e ela some do chat; a ação fica na auditoria", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const marca = Date.now();
    const dono = await createConfirmedUser("Bar Denunciado");
    await createApprovedPartner(dono, "Bar Denunciado");
    const placeId = await createTestPlace(`Bar Denunciado ${marca}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const rui = await createConfirmedUser(`Rui ${marca}`);
    const leo = await createConfirmedUser("Leo Atento");
    const mantida = `mensagem inocente ${marca}`;
    const apagada = `propaganda enganosa ${marca}`;

    // Rui escreve duas mensagens; Leo denuncia as duas.
    const ruiContext = await browser.newContext();
    const ruiPage = await ruiContext.newPage();
    await loginAs(ruiPage, rui, `/lugares/${placeId}`);
    for (const texto of [mantida, apagada]) {
      await chatOf(ruiPage).getByRole("textbox", { name: "Mensagem" }).fill(texto);
      await chatOf(ruiPage).getByRole("button", { name: "Enviar mensagem" }).click();
      await expect(chatOf(ruiPage).getByRole("log")).toContainText(texto);
      await ruiPage.waitForTimeout(3_200);
    }
    // Ninguém denuncia a própria mensagem.
    await chatOf(ruiPage).getByRole("button", { name: `Opções da mensagem de Rui ${marca}` }).first().click();
    await expect(chatOf(ruiPage).getByRole("button", { name: "Denunciar" })).toHaveCount(0);

    await loginAs(page, leo, `/lugares/${placeId}`);
    const chat = chatOf(page);
    const log = chat.getByRole("log", { name: "Mensagens do chat" });
    for (const [texto, motivo] of [
      [mantida, "Outro motivo"],
      [apagada, "Spam ou golpe"],
    ]) {
      const item = log.getByRole("listitem").filter({ hasText: texto });
      await item.getByRole("button", { name: `Opções da mensagem de Rui ${marca}` }).click();
      await item.getByRole("button", { name: "Denunciar" }).click();
      await item.getByRole("group", { name: "Motivo da denúncia" }).getByRole("button", { name: motivo }).click();
      await expect(chat.getByRole("status").filter({ hasText: "Denúncia enviada. A moderação vai analisar." })).toBeVisible();
    }
    // A mensagem continua no chat até a moderação decidir.
    await expect(log).toContainText(apagada);

    // Visitante não denuncia pelo endpoint.
    const feed = await (await request.get(`/api/live/chat?streamId=${stream.id}`)).json();
    expect((await request.post("/api/live/chat/reports", { data: { messageId: feed.messages[0].id, reason: "spam" } })).status()).toBe(401);

    // Moderação: fila no backoffice, mantém uma e apaga a outra.
    const moderador = await createConfirmedUser(`Moderação ${marca}`);
    await grantRole(moderador, "moderator");
    const modContext = await browser.newContext();
    const mod = await modContext.newPage();
    await loginAs(mod, moderador, "/admin/conteudo");
    await mod.getByRole("link", { name: "Denúncias do chat" }).click();
    await expect(mod).toHaveURL(new RegExp("/admin/conteudo/denuncias$"));
    const fila = mod.getByRole("list", { name: "Denúncias em aberto" });
    const cartaoApagada = fila.getByRole("listitem").filter({ hasText: apagada });
    await expect(cartaoApagada).toContainText(`Rui ${marca}`);
    await expect(cartaoApagada).toContainText("1 denúncia");
    await expect(cartaoApagada).toContainText("Spam ou golpe");
    await fila.getByRole("listitem").filter({ hasText: mantida }).getByRole("button", { name: `Manter a mensagem de Rui ${marca}` }).click();
    await expect(fila.getByRole("listitem").filter({ hasText: mantida })).toHaveCount(0);
    await cartaoApagada.getByRole("button", { name: `Apagar a mensagem de Rui ${marca}` }).click();
    await expect(mod.getByText(apagada)).toHaveCount(0);

    // No chat: a apagada some para todos; a mantida fica.
    await expect(log).not.toContainText(apagada, soon);
    await expect(log).toContainText(mantida);

    // Auditoria (só admin lê).
    const auditor = await createConfirmedUser("Admin das Denúncias");
    await grantRole(auditor, "admin");
    const auditContext = await browser.newContext();
    const auditoria = await auditContext.newPage();
    await loginAs(auditoria, auditor, "/admin/auditoria");
    await expect(auditoria.getByRole("table").getByRole("row").filter({ hasText: `Moderação ${marca}` }).filter({ hasText: "Resolveu denúncia de mensagem do chat" })).toHaveCount(2);

    await Promise.all([ruiContext.close(), modContext.close(), auditContext.close()]);
  });

  test("quem não modera não abre a fila de denúncias (404)", async ({ page }) => {
    const parceiro = await createConfirmedUser("Parceiro sem fila");
    await createApprovedPartner(parceiro, "Bar sem fila");
    await loginAs(page, parceiro, "/parceiro/inicio");
    expect((await page.goto("/admin/conteudo/denuncias"))?.status()).toBe(404);
  });
});
