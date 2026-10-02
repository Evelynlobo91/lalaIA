import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace, grantRole, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("suspender e reativar parceiro (#144)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de moderação roda só no celular");
  });

  test("admin suspende com motivo → conteúdo some e o parceiro vê o motivo → admin reativa → conteúdo volta", async ({ page, browser }) => {
    const unico = `Suspenso ${Date.now()}`;
    const dono = await createConfirmedUser("Dono Suspenso");
    await createApprovedPartner(dono, unico);
    const placeId = await createTestPlace(`Casa ${unico}`, isolatedPoint());
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show ${unico}`, startsInHours: 2, durationHours: 2 });

    // Antes: o evento é público.
    expect((await page.goto(`/eventos/${eventId}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: `Show ${unico}` })).toBeVisible();

    // Admin suspende, com motivo obrigatório.
    const admin = await createConfirmedUser("Admin Moderador");
    await grantRole(admin, "admin");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, admin, "/admin/parceiros");
    const card = adminPage.getByRole("article", { name: `Parceiro ${unico}` });
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Suspender" }).click();
    await card.getByLabel("Motivo da suspensão (o parceiro vai ver)").fill("Denúncias de conteúdo irregular.");
    await card.getByRole("button", { name: "Confirmar suspensão" }).click();
    await expect(card.getByText("Suspenso", { exact: true })).toBeVisible();
    await expect(card.getByText("Denúncias de conteúdo irregular.")).toBeVisible();

    // O evento some das telas públicas.
    expect((await page.goto(`/eventos/${eventId}`))?.status()).toBe(404);
    const api = await page.request.get(`/api/discovery/search?q=${encodeURIComponent(unico)}`);
    expect(JSON.stringify(await api.json())).not.toContain(`Show ${unico}`);

    // O parceiro perde o portal e vê o motivo.
    const donoContext = await browser.newContext();
    const donoPage = await donoContext.newPage();
    await loginAs(donoPage, dono);
    await donoPage.goto("/parceiro/eventos");
    await expect(donoPage).toHaveURL(/\/parceiro$/);
    await expect(donoPage.getByText("Seu acesso ao portal está suspenso.")).toBeVisible();
    await expect(donoPage.getByText("Denúncias de conteúdo irregular.")).toBeVisible();
    await expect(donoPage.getByRole("button", { name: /Enviar|Salvar/ })).toHaveCount(0);

    // Admin reativa: tudo volta sem recadastro.
    await card.getByRole("button", { name: "Reativar" }).click();
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
    expect((await page.goto(`/eventos/${eventId}`))?.status()).toBe(200);
    await donoPage.goto("/parceiro");
    await expect(donoPage).toHaveURL(/\/parceiro\/inicio$/);

    await adminContext.close();
    await donoContext.close();
  });

  test("suspensão sem motivo não passa", async ({ page }) => {
    const unico = `SemMotivo ${Date.now()}`;
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono, unico);
    const admin = await createConfirmedUser();
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin/parceiros");

    const card = page.getByRole("article", { name: `Parceiro ${unico}` });
    await card.getByRole("button", { name: "Suspender" }).click();
    await card.getByLabel("Motivo da suspensão (o parceiro vai ver)").fill("abc");
    await card.getByRole("button", { name: "Confirmar suspensão" }).click();
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();
    await expect(card.getByText("Suspenso", { exact: true })).toHaveCount(0);
  });
});
