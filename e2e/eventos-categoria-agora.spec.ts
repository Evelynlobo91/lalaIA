import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { findInPagedList } from "./support/lists";
import { createConfirmedUser } from "./support/users";

test.describe("eventos por categoria (#40)", () => {
  test("uma ou várias categorias, combinadas com a data, e limpar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra de filtro não depende da largura da tela");
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Espaço Categorias ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Cat ${tag}`, startsInHours: 2, durationHours: 1, category: "shows" });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Feira Cat ${tag}`, startsInHours: 2, durationHours: 1, category: "feiras" });

    await page.goto("/eventos");
    const categorias = page.getByRole("navigation", { name: "Filtrar por categoria" });
    const lista = page.getByRole("list", { name: "Eventos" });

    // Uma categoria.
    await categorias.getByRole("link", { name: "Shows e música" }).click();
    await expect(page).toHaveURL(/categoria=shows$/);
    await expect(categorias.getByRole("link", { name: "Shows e música" })).toHaveAttribute("aria-current", "true");
    await expect(await findInPagedList(page, lista, `Show Cat ${tag}`)).toBeVisible();
    await expect(lista.getByText(`Feira Cat ${tag}`)).toHaveCount(0);

    // Várias: o segundo chip soma à seleção.
    await categorias.getByRole("link", { name: "Feiras e mercados" }).click();
    await expect(page).toHaveURL(/categoria=shows,feiras$/);
    await expect(await findInPagedList(page, lista, `Feira Cat ${tag}`)).toBeVisible();

    // Data preserva as categorias (e vice-versa).
    await page.getByRole("navigation", { name: "Filtrar por data" }).getByRole("link", { name: "Fim de semana" }).click();
    await expect(page).toHaveURL(/quando=fim-de-semana&categoria=shows,feiras$/);

    // Limpar categorias mantém a data.
    await categorias.getByRole("link", { name: "Todas as categorias" }).click();
    await expect(page).toHaveURL(/\/eventos\?quando=fim-de-semana$/);
  });

  test("categoria inválida mostra aviso e a API responde 400", async ({ page, request }) => {
    await page.goto("/eventos?categoria=nao-existe");
    await expect(page.getByText(/Categoria inválida/)).toBeVisible();
    expect((await request.get("/api/events?categoria=nao-existe")).status()).toBe(400);
    expect((await request.get("/api/events?categoria=shows,feiras")).status()).toBe(200);
  });
});

test.describe("acontecendo agora / em breve (#41)", () => {
  test("separa agora e em breve, mostra o tempo e a distância com GPS", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra de tempo não depende da largura da tela");
    const tag = `${Date.now()}`;
    const ponto = { lat: -26.3045, lon: -48.8456 };
    const placeId = await createTestPlace(`Palco Agora ${tag}`, ponto);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Rolando ${tag}`, startsInHours: -0.5, durationHours: 2 });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Daqui a pouco ${tag}`, startsInHours: 1, durationHours: 1 });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Mais tarde ${tag}`, startsInHours: 5, durationHours: 1 });

    await page.goto("/eventos");
    await page.getByRole("link", { name: "Acontecendo agora" }).click();
    await expect(page).toHaveURL(/\/eventos\/agora$/);

    const agora = page.getByRole("list", { name: /^Agora/ });
    const emBreve = page.getByRole("list", { name: /^Em breve/ });
    const rolando = agora.getByRole("listitem").filter({ hasText: `Rolando ${tag}` });
    await expect(rolando).toContainText(/Começou há (29|30|31) min/);
    await expect(emBreve.getByRole("listitem").filter({ hasText: `Daqui a pouco ${tag}` })).toContainText(/Começa em (59 min|1 h)/);
    await expect(page.getByText(`Mais tarde ${tag}`)).toHaveCount(0);

    // Com GPS: distância e ordem do mais perto.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon });
    await page.getByRole("button", { name: "Ver distância" }).click();
    await expect(page).toHaveURL(/\/eventos\/agora\?lat=-26\.3045&lon=-48\.8456$/);
    await expect(page.getByText("Do mais perto para o mais longe de você.")).toBeVisible();
    await expect(agora.getByRole("listitem").filter({ hasText: `Rolando ${tag}` })).toContainText("10 m");
  });

  test("localização inválida não quebra: mostra sem distância; API valida", async ({ page, request }) => {
    await page.goto("/eventos/agora?lat=10&lon=-48.8");
    await expect(page.getByText(/Fora da área atendida/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acontecendo agora", level: 1 })).toBeVisible();
    expect((await request.get("/api/events/agora?lat=10&lon=-48.8")).status()).toBe(400);
    expect((await request.get("/api/events/agora")).status()).toBe(200);
  });
});
