import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { createConfirmedUser } from "./support/users";

test.describe("detalhe do evento (#38)", () => {
  test("mostra quando, onde (com link), valor, descrição e como chegar", async ({ page }, testInfo) => {
    const tag = `${testInfo.project.name}-${Date.now()}`;
    const lugar = `Teatro Detalhe ${tag}`;
    const placeId = await createTestPlace(lugar);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Jazz ${tag}`, startsInHours: 2, durationHours: 3, priceCents: 5000 });

    await page.goto(`/eventos/${eventId}`);
    await expect(page.getByRole("heading", { level: 1, name: `Jazz ${tag}` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Valor" })).toContainText(/A partir de R\$\s?50,00/);
    await expect(page.getByRole("region", { name: "Onde" }).getByRole("link", { name: lugar })).toHaveAttribute("href", `/lugares/${placeId}`);
    await expect(page.getByRole("link", { name: "Como chegar" })).toHaveAttribute("href", /google\.com\/maps\/dir/);
    await expect(page.getByText("Evento criado pelos testes automatizados.")).toBeVisible();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", `Jazz ${tag} · LalaIA`);
  });

  test("estados: acontecendo agora, encerrado e cancelado", async ({ page }, testInfo) => {
    const tag = `${testInfo.project.name}-${Date.now()}`;
    const placeId = await createTestPlace(`Bar Estados ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const agora = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Agora ${tag}`, startsInHours: -1, durationHours: 3 });
    const encerrado = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Encerrado ${tag}`, startsInHours: -6, durationHours: 2 });
    const cancelado = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Cancelado ${tag}`, startsInHours: 4, durationHours: 2, cancelled: true });

    await page.goto(`/eventos/${agora}`);
    await expect(page.getByText("Acontecendo agora")).toBeVisible();

    await page.goto(`/eventos/${encerrado}`);
    await expect(page.getByText("Encerrado", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Como chegar" })).toHaveCount(0);

    await page.goto(`/eventos/${cancelado}`);
    await expect(page.getByText("Este evento foi cancelado pelo organizador.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Como chegar" })).toHaveCount(0);
  });

  test("id inexistente ou inválido → 404", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "nao-e-id"]) {
      expect((await page.goto(`/eventos/${id}`))?.status()).toBe(404);
      await expect(page.getByText("Evento não encontrado")).toBeVisible();
    }
  });
});
