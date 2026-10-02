import { expect, test, type Page } from "@playwright/test";
import { createApprovedPartner, createTestMission, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

const alerta = (page: Page) => page.getByRole("alert").and(page.locator(":not(#__next-route-announcer__)"));

/** Explorador aceita a missão de 1 etapa e conclui pelo QR que o parceiro mostra no portal. */
async function concluirPeloQr(portal: Page, page: Page, missionId: string, titulo: string) {
  await page.goto(`/missoes/${missionId}`);
  await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
  await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();
  await portal.goto(`/parceiro/missoes/${missionId}/qr`);
  const qrUrl = new URL((await portal.getByRole("img", { name: /QR code da etapa 1/ }).getAttribute("data-qr-url"))!);
  await page.goto(qrUrl.pathname + qrUrl.search);
  await page.getByRole("button", { name: "Concluir etapa" }).click();
  await expect(page.getByText(/Missão concluída!/).first()).toBeVisible();
}

test.describe("recompensa do parceiro vinculada à missão (#62)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("parceiro vincula a recompensa, quem conclui resgata o código e o parceiro valida uma vez só; esgotada avisa", async ({ page, browser }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Bar Recompensa ${sufixo}`);
    const parceiro = await createConfirmedUser("Dono do Bar");
    await createApprovedPartner(parceiro, "Bar Recompensa E2E");
    const titulo = `Rota do Chope ${sufixo}`;
    const { missionId } = await createTestMission({ ownerEmail: parceiro.email, title: titulo, steps: [{ title: "Peça o chope da casa", placeId: lugar }] });

    // 1. Parceiro vincula a recompensa no portal (estoque 1).
    const portalCtx = await browser.newContext();
    const portal = await portalCtx.newPage();
    await loginAs(portal, parceiro, "/parceiro/missoes");
    await portal.getByRole("link", { name: `Recompensa de ${titulo}` }).click();
    await expect(portal.getByRole("heading", { name: `Recompensa · ${titulo}` })).toBeVisible();
    await portal.getByLabel("Recompensa", { exact: true }).fill("1 chope grátis");
    await portal.getByLabel("Estoque total (opcional)").fill("1");
    await portal.getByRole("button", { name: "Vincular recompensa" }).click();
    await expect(portal.getByRole("status").filter({ hasText: "Recompensa salva." })).toBeVisible();

    // 2. Explorador vê o prêmio como incentivo, conclui e resgata.
    const explorador = await createConfirmedUser("Exploradora");
    await loginAs(page, explorador, `/missoes/${missionId}`);
    const card = page.getByRole("article", { name: "Recompensa" });
    await expect(card.getByText("1 chope grátis")).toBeVisible();
    await expect(card.getByText("Conclua todas as etapas para resgatar")).toBeVisible();
    await concluirPeloQr(portal, page, missionId, titulo);

    await page.getByRole("button", { name: "Resgatar recompensa" }).click();
    const codigo = (await page.getByRole("status").filter({ hasText: "Seu código" }).locator(".font-mono").textContent())!.trim();
    expect(codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

    // Idempotente: recarregar mostra o mesmo código, que também fica em "Minhas recompensas".
    await page.reload();
    await expect(page.getByRole("article", { name: "Recompensa" }).getByText(codigo)).toBeVisible();
    await page.goto("/perfil");
    const minhas = page.getByRole("article", { name: "Minhas recompensas" });
    await expect(minhas.getByText(codigo)).toBeVisible();
    await expect(minhas.getByText("1 chope grátis")).toBeVisible();

    // 3. Estoque acabou: a segunda pessoa conclui a missão (com o XP), mas recebe o aviso de esgotada.
    const segunda = await createConfirmedUser("Segunda");
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await loginAs(p2, segunda, `/missoes/${missionId}`);
    await concluirPeloQr(portal, p2, missionId, titulo);
    await expect(p2.getByText("As recompensas desta missão esgotaram. Sua missão continua concluída, com o XP.")).toBeVisible();
    await expect(p2.getByRole("button", { name: "Resgatar recompensa" })).toHaveCount(0);
    await ctx2.close();

    // 4. Parceiro valida no balcão: vale uma vez; código desconhecido é "inválido".
    await portal.goto(`/parceiro/missoes/${missionId}/recompensa`);
    await portal.getByLabel("Código do explorador").fill(codigo.toLowerCase());
    await portal.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(portal.getByRole("status").filter({ hasText: "validado" })).toContainText("1 chope grátis");

    await portal.getByLabel("Código do explorador").fill(codigo);
    await portal.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(alerta(portal)).toContainText("já foi usado");

    await portal.getByLabel("Código do explorador").fill("ZZZZ-2222");
    await portal.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(alerta(portal)).toHaveText("Código inválido.");

    await portal.reload();
    await expect(portal.getByText("1 resgate de 1 · 1 entregue no balcão")).toBeVisible();
    // Depois do primeiro resgate a recompensa não muda.
    await expect(portal.getByText("Esta recompensa já foi resgatada: não pode mais mudar.")).toBeVisible();
    await expect(portal.getByRole("button", { name: /Salvar recompensa|Vincular recompensa/ })).toHaveCount(0);

    // Código de outra missão (de outro parceiro) recebe a mesma resposta.
    const intruso = await createConfirmedUser("Outro parceiro");
    await createApprovedPartner(intruso, "Concorrente E2E");
    const outroLugar = await createTestPlace(`Bar Concorrente ${sufixo}`);
    const outraMissao = await createTestMission({ ownerEmail: intruso.email, title: `Rota Concorrente ${sufixo}`, steps: [{ title: "Peça um pastel", placeId: outroLugar }] });
    const ctx3 = await browser.newContext();
    const outro = await ctx3.newPage();
    await loginAs(outro, intruso, `/parceiro/missoes/${outraMissao.missionId}/recompensa`);
    await outro.getByLabel("Recompensa", { exact: true }).fill("Pastel grátis");
    await outro.getByRole("button", { name: "Vincular recompensa" }).click();
    await expect(outro.getByRole("status").filter({ hasText: "Recompensa salva." })).toBeVisible();
    await outro.getByLabel("Código do explorador").fill(codigo);
    await outro.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(alerta(outro)).toHaveText("Código inválido.");
    await ctx3.close();
    await portalCtx.close();
  });

  test("missão com etapa só por GPS não aceita recompensa e o portal explica por quê", async ({ page }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Praça GPS ${sufixo}`);
    const parceiro = await createConfirmedUser("Parceira GPS");
    await createApprovedPartner(parceiro, "Praça GPS E2E");
    const { missionId } = await createTestMission({
      ownerEmail: parceiro.email,
      title: `Passeio GPS ${sufixo}`,
      steps: [{ title: "Passe pela praça", placeId: lugar, validation: "gps" }],
    });

    await loginAs(page, parceiro, `/parceiro/missoes/${missionId}/recompensa`);
    const aviso = page.getByRole("note", { name: "Recompensa indisponível" });
    await expect(aviso).toContainText("Check-in só por GPS pode ser falsificado no celular");
    await expect(page.getByRole("button", { name: "Vincular recompensa" })).toHaveCount(0);

    // A página do explorador não mostra recompensa nenhuma.
    await page.goto(`/missoes/${missionId}`);
    await expect(page.getByRole("article", { name: "Recompensa" })).toHaveCount(0);
  });

  test("portal de recompensa de missão alheia dá 404", async ({ page }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Café Alheio ${sufixo}`);
    const dono = await createConfirmedUser("Dono");
    await createApprovedPartner(dono, "Café Alheio E2E");
    const { missionId } = await createTestMission({ ownerEmail: dono.email, title: `Rota Alheia ${sufixo}`, steps: [{ title: "Peça um café", placeId: lugar }] });

    const intruso = await createConfirmedUser("Intrusa");
    await createApprovedPartner(intruso, "Intrusa E2E");
    await loginAs(page, intruso, "/parceiro/missoes");
    const resposta = await page.goto(`/parceiro/missoes/${missionId}/recompensa`);
    expect(resposta?.status()).toBe(404);
  });
});
