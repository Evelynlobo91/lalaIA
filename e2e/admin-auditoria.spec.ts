import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace, grantRole, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("backoffice: trilha de auditoria (#146)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de auditoria roda só no celular");
  });

  test("suspender, reativar e editar um evento alheio ficam registrados com quem fez", async ({ page }) => {
    const unico = `Auditado${Date.now()}`;
    const dono = await createConfirmedUser("Dono Auditado");
    await createApprovedPartner(dono, `Casa ${unico}`);
    const placeId = await createTestPlace(`Lugar ${unico}`, isolatedPoint());
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show ${unico}`, startsInHours: 4, durationHours: 2 });

    const nomeAdmin = `Admin ${unico}`;
    const admin = await createConfirmedUser(nomeAdmin);
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin/parceiros");

    // Três ações administrativas.
    const card = page.getByRole("article", { name: `Parceiro Casa ${unico}` });
    await card.getByRole("button", { name: "Suspender" }).click();
    await card.getByLabel("Motivo da suspensão (o parceiro vai ver)").fill("Teste da trilha de auditoria.");
    await card.getByRole("button", { name: "Confirmar suspensão" }).click();
    await expect(card.getByText("Suspenso", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Reativar" }).click();
    await expect(card.getByText("Ativo", { exact: true })).toBeVisible();

    await page.goto(`/admin/conteudo/eventos/${eventId}/editar`);
    await expect(page.getByRole("heading", { level: 1, name: "Editar evento" })).toBeVisible();
    await page.getByLabel("Título").fill(`Show ${unico} Revisado`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/conteudo\?tipo=eventos&salvo=/);

    // A trilha mostra as três, com o nome de quem fez.
    await page.getByRole("navigation", { name: "Backoffice" }).getByRole("link", { name: "Auditoria" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
    await page.locator('select[name="quem"]').selectOption({ label: nomeAdmin });
    await page.getByRole("button", { name: "Filtrar" }).click();
    const linhas = page.getByRole("table").getByRole("row").filter({ hasText: nomeAdmin });
    await expect(linhas).toHaveCount(3);
    await expect(linhas.filter({ hasText: "Suspendeu o parceiro" })).toHaveCount(1);
    await expect(linhas.filter({ hasText: "Reativou o parceiro" })).toHaveCount(1);
    await expect(linhas.filter({ hasText: "Editou o evento" })).toHaveCount(1);

    // Filtro por ação.
    await page.locator('select[name="acao"]').selectOption({ label: "Suspendeu o parceiro" });
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("table").getByRole("row").filter({ hasText: nomeAdmin })).toHaveCount(1);
  });

  test("quem não é admin não vê a trilha (404)", async ({ page }) => {
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    await loginAs(page, parceiro);
    expect((await page.goto("/admin/auditoria"))?.status()).toBe(404);
  });
});
