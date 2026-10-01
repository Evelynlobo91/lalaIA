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
    await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();

    await page.goto("/missoes");
    await expect(page.getByRole("region", { name: "Suas missões ativas" }).getByText(titulo)).toBeVisible();

    await page.goto("/perfil");
    await expect(page.getByRole("article", { name: "Missões ativas" }).getByText(titulo)).toBeVisible();
  });
});
