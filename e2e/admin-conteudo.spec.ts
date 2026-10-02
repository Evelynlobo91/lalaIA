import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestEvent, createTestMission, createTestPlace, grantRole, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("backoffice: gerir conteúdo (#142)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de edição roda só no celular");
  });

  test("admin busca e edita um evento, uma missão e um lugar de outro parceiro", async ({ page }) => {
    const unico = `Conteudo${Date.now()}`;
    const dono = await createConfirmedUser("Dono do Conteúdo");
    await createApprovedPartner(dono, `Casa ${unico}`);
    const placeId = await createTestPlace(`Lugar ${unico}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show ${unico}`, startsInHours: 4, durationHours: 2 });
    await createTestMission({ ownerEmail: dono.email, title: `Rota ${unico}`, steps: [{ title: "Passe no balcão", placeId }] });

    const admin = await createConfirmedUser("Admin do Conteúdo");
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin/conteudo");

    // Lugares: pede pelo menos 2 letras; depois encontra e edita.
    await expect(page.getByText("Digite pelo menos 2 letras do nome do lugar para buscar.")).toBeVisible();
    await page.getByLabel("Buscar por nome").fill(unico);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("link", { name: `Editar Lugar ${unico}` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/conteudo/lugares/${placeId}/editar$`));
    await page.getByLabel("Nome").fill(`Lugar ${unico} Corrigido`);
    await expect(page.getByLabel("Nome")).toHaveValue(`Lugar ${unico} Corrigido`);
    await page.getByRole("button", { name: /Salvar/ }).click();
    await expect(page.getByText("Dados atualizados.")).toBeVisible();
    await page.goto(`/lugares/${placeId}`);
    await expect(page.getByRole("heading", { level: 1, name: `Lugar ${unico} Corrigido` })).toBeVisible();

    // Eventos: a aba mantém o texto buscado; salvar volta para o backoffice.
    await page.goto(`/admin/conteudo?tipo=lugares&q=${unico}`);
    await page.getByRole("navigation", { name: "Tipo de conteúdo" }).getByRole("link", { name: "Eventos" }).click();
    await expect(page).toHaveURL(new RegExp(`tipo=eventos&q=${unico}`));
    await page.getByRole("link", { name: `Editar Show ${unico}` }).click();
    await page.getByLabel("Título").fill(`Show ${unico} Corrigido`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/conteudo\?tipo=eventos&salvo=/);
    await expect(page.getByText("Alterações salvas.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Eventos" }).getByText(`Show ${unico} Corrigido`)).toBeVisible();

    // Missões.
    await page.goto(`/admin/conteudo?tipo=missoes&q=${unico}`);
    await page.getByRole("link", { name: `Editar Rota ${unico}` }).click();
    await page.getByLabel("Título").fill(`Rota ${unico} Corrigida`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/conteudo\?tipo=missoes&salvo=/);
    await expect(page.getByRole("list", { name: "Missões" }).getByText(`Rota ${unico} Corrigida`)).toBeVisible();
  });

  test("quem não é admin não vê a lista nem as páginas de edição (404)", async ({ page }) => {
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const placeId = await createTestPlace(`Lugar Fechado ${Date.now()}`, isolatedPoint());
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: "Evento Fechado", startsInHours: 4, durationHours: 2 });
    await loginAs(page, dono);

    for (const rota of ["/admin/conteudo", `/admin/conteudo/eventos/${eventId}/editar`, `/admin/conteudo/lugares/${placeId}/editar`]) {
      expect((await page.goto(rota))?.status(), rota).toBe(404);
    }
  });

  test("id inexistente na edição responde 404 para o admin", async ({ page }) => {
    const admin = await createConfirmedUser();
    await grantRole(admin, "admin");
    await loginAs(page, admin, "/admin");
    expect((await page.goto("/admin/conteudo/eventos/00000000-0000-4000-8000-000000000000/editar"))?.status()).toBe(404);
    expect((await page.goto("/admin/conteudo/missoes/nao-e-um-id/editar"))?.status()).toBe(404);
  });
});
