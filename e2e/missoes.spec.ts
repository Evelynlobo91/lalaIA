import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestMission, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("missões do explorador", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("lista pública: visitante vê a missão disponível e é convidado a entrar para aceitar (#58)", async ({ page }) => {
    const lugar = `Café Lista ${Date.now()}`;
    const placeId = await createTestPlace(lugar);
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão Pública ${Date.now()}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, steps: [{ title: "Peça um café", placeId }] });
    // Futura e encerrada não aparecem.
    await createTestMission({ ownerEmail: parceiro.email, title: `${titulo} futura`, startsInHours: 24, steps: [{ title: "Peça um café", placeId }] });

    await page.goto("/missoes");
    const disponiveis = page.getByRole("region", { name: "Missões disponíveis" });
    await expect(disponiveis.getByRole("heading", { name: titulo, exact: true })).toBeVisible();
    await expect(disponiveis.getByText(`${titulo} futura`)).toHaveCount(0);
    await expect(disponiveis.getByRole("link", { name: "Entre para aceitar" }).first()).toBeVisible();
  });

  test("aceita uma missão: aparece como ativa na lista e no perfil (#58)", async ({ page }) => {
    const placeId = await createTestPlace(`Café Aceite ${Date.now()}`);
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão Aceite ${Date.now()}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, steps: [{ title: "Peça um café", placeId }] });

    const explorador = await createConfirmedUser("Exploradora E2E");
    await loginAs(page, explorador, "/missoes");
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await expect(page).toHaveURL(/\/missoes\/[0-9a-f-]{36}\?aceita=1$/);
    await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();

    await page.goto("/missoes");
    await expect(page.getByRole("region", { name: "Suas missões ativas" }).getByText(titulo)).toBeVisible();

    await page.goto("/perfil");
    await expect(page.getByRole("article", { name: "Missões ativas" }).getByText(titulo)).toBeVisible();
  });

  test("tela da missão: etapas com status, percentual e link para o lugar de cada etapa (#59)", async ({ page }) => {
    const sufixo = Date.now();
    const cafe = await createTestPlace(`Café Progresso ${sufixo}`);
    const bar = await createTestPlace(`Bar Progresso ${sufixo}`);
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão Progresso ${sufixo}`;
    const { missionId } = await createTestMission({
      ownerEmail: parceiro.email,
      title: titulo,
      xp: 90,
      steps: [
        { title: "Peça um espresso", placeId: cafe },
        { title: "Prove o chope", placeId: bar },
      ],
    });

    // Visitante vê as etapas e é convidado a entrar.
    await page.goto(`/missoes/${missionId}`);
    await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
    await expect(page.getByText("30 XP por etapa + 30 XP de bônus ao concluir a missão.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Entre para aceitar" })).toBeVisible();

    const explorador = await createConfirmedUser();
    await loginAs(page, explorador, `/missoes/${missionId}`);
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await expect(page.getByRole("progressbar", { name: "Progresso" })).toHaveAttribute("aria-valuenow", "0");
    const etapas = page.getByRole("region", { name: "Etapas" });
    await expect(etapas.getByText("1. Peça um espresso")).toBeVisible();
    await expect(etapas.getByText("Próxima")).toBeVisible();
    await expect(etapas.getByText("Pendente")).toBeVisible();

    await etapas.getByRole("link", { name: new RegExp(`Bar Progresso ${sufixo}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/lugares/${bar}$`));
  });

  test("missão inexistente ou id inválido dá 404 (#59)", async ({ page }) => {
    expect((await page.goto("/missoes/nao-existe"))?.status()).toBe(404);
    expect((await page.goto("/missoes/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  });
});
