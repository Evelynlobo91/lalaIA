import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveCta, createLiveStream, createTestPlace, ctaCounts, grantRole, isolatedPoint, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("chamadas na live: resultado e moderação (#182)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo das chamadas roda só no celular");
  });

  test("impressão e toque são contados e aparecem para o parceiro; a moderação desativa e a chamada some do player", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const titulo = `Rodada dupla ${Date.now()}`;
    const dono = await createConfirmedUser("Dona das Métricas");
    await createApprovedPartner(dono, "Bar das Métricas");
    const placeId = await createTestPlace(`Bar das Métricas ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    const ctaId = await createLiveCta(stream.id, { title: titulo, href: "/missoes", buttonLabel: "Ver missões", type: "missao", startsInMinutes: -5, durationMinutes: 60 });
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    // Quem assiste vê a chamada (1 impressão; recarregar não conta de novo) e toca no botão (1 toque).
    const context = await browser.newContext();
    const publico = await context.newPage();
    await publico.goto(`/lugares/${placeId}`);
    const cartao = publico.getByRole("complementary", { name: "Chamada do anfitrião" });
    await expect(cartao).toContainText(titulo);
    await expect.poll(() => ctaCounts(ctaId)).toEqual({ cta_impression: 1 });
    await publico.reload();
    await expect(cartao).toContainText(titulo);
    await cartao.getByRole("link", { name: "Ver missões" }).click();
    await expect(publico).toHaveURL(/\/missoes$/);
    await expect.poll(() => ctaCounts(ctaId)).toEqual({ cta_impression: 1, cta_click: 1 });

    // O parceiro vê os números na lista de chamadas.
    await loginAs(page, dono, `/parceiro/live/chamadas/${stream.id}`);
    const resultado = page.getByLabel(`Resultado da chamada ${titulo}`);
    await expect(resultado).toContainText("Apareceu1");
    await expect(resultado).toContainText("Toques1");
    await expect(resultado).toContainText("(100%)");

    // A moderação desativa: some do player, e o parceiro vê o aviso sem poder soltar a chamada.
    const moderador = await createConfirmedUser("Moderação");
    await grantRole(moderador, "moderator");
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAs(admin, moderador, "/admin/conteudo");
    await admin.getByRole("link", { name: "Chamadas nas lives" }).click();
    await expect(admin).toHaveURL(/\/admin\/conteudo\/chamadas$/);
    const linha = admin.getByRole("listitem", { name: `Chamada ${titulo}` });
    await expect(linha).toContainText("Ativa");
    await linha.getByRole("button", { name: `Desativar a chamada ${titulo}` }).click();
    await expect(linha).toContainText("Desativada");

    await publico.goto(`/lugares/${placeId}`);
    await expect(publico.getByRole("region", { name: "Transmissão ao vivo" }).locator("video")).toBeVisible();
    await expect(cartao).toHaveCount(0);

    await page.reload();
    const chamada = page.getByRole("article", { name: `Chamada ${titulo}` });
    await expect(chamada).toContainText("Desativada pela moderação");
    await expect(chamada.getByRole("button", { name: `Soltar agora a chamada ${titulo}` })).toHaveCount(0);

    // A ação fica na auditoria (só admin lê), e reativar devolve a chamada ao player.
    await linha.getByRole("button", { name: `Reativar a chamada ${titulo}` }).click();
    await expect(linha).toContainText("Ativa");
    await publico.reload();
    await expect(cartao).toContainText(titulo);

    const auditor = await createConfirmedUser("Admin da Auditoria");
    await grantRole(auditor, "admin");
    const auditContext = await browser.newContext();
    const auditoria = await auditContext.newPage();
    await loginAs(auditoria, auditor, "/admin/auditoria");
    const linhas = auditoria.getByRole("table").getByRole("row").filter({ hasText: "Moderação" });
    await expect(linhas.filter({ hasText: "Desativou a chamada da live" }).first()).toBeVisible();
    await expect(linhas.filter({ hasText: "Reativou a chamada da live" }).first()).toBeVisible();

    await Promise.all([context.close(), adminContext.close(), auditContext.close()]);
  });

  test("quem não modera não abre a lista de chamadas do backoffice", async ({ page }) => {
    const parceiro = await createConfirmedUser("Parceiro curioso");
    await createApprovedPartner(parceiro, "Bar Curioso");
    await loginAs(page, parceiro, "/parceiro/inicio");
    const response = await page.goto("/admin/conteudo/chamadas");
    expect(response?.status()).toBe(404);
  });
});
