import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { findInPagedList } from "./support/lists";
import { createConfirmedUser } from "./support/users";

test.describe("lista pública de eventos (#37)", () => {
  test("mostra o que está acontecendo e o que vem; esconde terminados e cancelados", async ({ page }, testInfo) => {
    const tag = `${testInfo.project.name}-${Date.now()}`;
    const lugar = `Teatro E2E ${tag}`;
    const placeId = await createTestPlace(lugar);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);

    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Agora ${tag}`, startsInHours: -1, durationHours: 3 });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Depois ${tag}`, startsInHours: 2, durationHours: 2, priceCents: 4000 });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Terminou ${tag}`, startsInHours: -5, durationHours: 1 });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Cancelado ${tag}`, startsInHours: 3, durationHours: 1, cancelled: true });

    await page.goto("/eventos");
    await expect(page.getByRole("heading", { level: 1, name: "O que fazer" })).toBeVisible();
    const lista = page.getByRole("list", { name: "Eventos" });

    const agora = await findInPagedList(page, lista, `Agora ${tag}`);
    await expect(agora.getByText("Acontecendo")).toBeVisible();
    await expect(agora.getByText(lugar)).toBeVisible();

    const depois = await findInPagedList(page, lista, `Depois ${tag}`);
    await expect(depois.getByText(/A partir de R\$\s?40,00/)).toBeVisible();
    // O card leva à página do evento (#38).
    await expect(depois.getByRole("link")).toHaveAttribute("href", /^\/eventos\/[0-9a-f-]{36}$/);

    // Percorre a lista toda: terminados e cancelados não podem aparecer em página nenhuma.
    await findInPagedList(page, lista, "__nunca__", 50);
    await expect(lista.getByText(`Terminou ${tag}`)).toHaveCount(0);
    await expect(lista.getByText(`Cancelado ${tag}`)).toHaveCount(0);
  });

  test("home leva aos eventos e a API recusa cursor adulterado", async ({ page, request }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Ver eventos" }).click();
    await expect(page).toHaveURL(/\/eventos$/);
    expect((await request.get("/api/events?cursor=lixo")).status()).toBe(400);
  });
});
