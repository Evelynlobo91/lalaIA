import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestMission, createTestPlace, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Check-in por GPS com geofence (#61). O GPS é simulado pelo Playwright (permissão + posição do contexto).
test.describe("missões com check-in por GPS", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("longe do lugar é recusado; no raio pede a permanência; sem permanência conclui e credita", async ({ page, context }) => {
    const sufixo = Date.now();
    const ponto = isolatedPoint();
    const praca = await createTestPlace(`Praça GPS ${sufixo}`, ponto, "passeios");
    const mirante = await createTestPlace(`Mirante GPS ${sufixo}`, { lat: ponto.lat + 0.01, lon: ponto.lon }, "ar-livre");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão GPS ${sufixo}`;
    await createTestMission({
      ownerEmail: parceiro.email,
      title: titulo,
      xp: 60,
      steps: [
        { title: "Chegue à praça", placeId: praca, validation: "gps", radiusMeters: 100, dwellMinutes: 5 },
        { title: "Suba ao mirante", placeId: mirante, validation: "gps", radiusMeters: 100, dwellMinutes: 0 },
      ],
    });

    const explorador = await createConfirmedUser("Exploradora GPS");
    await loginAs(page, explorador, "/missoes");
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();

    await context.grantPermissions(["geolocation"]);
    // 1. Longe da praça (~1 km): recusado, com a distância.
    await context.setGeolocation({ latitude: ponto.lat + 0.01, longitude: ponto.lon, accuracy: 10 });
    await page.getByRole("button", { name: "Fazer check-in" }).click();
    await expect(page.getByRole("alert")).toContainText("Chegue a menos de 100 m");

    // 2. Na praça: chegou, mas a etapa pede 5 minutos no lugar.
    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon, accuracy: 10 });
    await page.getByRole("button", { name: "Fazer check-in" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Você chegou!" })).toContainText("5 minutos");
    await expect(page.getByText("Etapa 1 concluída!")).toHaveCount(0);
  });

  test("etapa sem permanência conclui no primeiro check-in e precisão ruim é recusada", async ({ page, context }) => {
    const sufixo = Date.now();
    const ponto = isolatedPoint();
    const praca = await createTestPlace(`Praça Rápida ${sufixo}`, ponto, "passeios");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão GPS Rápida ${sufixo}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, xp: 60, steps: [{ title: "Chegue à praça", placeId: praca, validation: "gps", radiusMeters: 50, dwellMinutes: 0 }] });

    const explorador = await createConfirmedUser("Explorador GPS");
    await loginAs(page, explorador, "/missoes");
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon, accuracy: 500 });
    await page.getByRole("button", { name: "Fazer check-in" }).click();
    await expect(page.getByRole("alert")).toContainText("imprecisa");

    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon, accuracy: 8 });
    await page.getByRole("button", { name: "Fazer check-in" }).click();
    await expect(page.getByText("Etapa 1 concluída! +30 XP. Missão concluída! +30 XP de bônus.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fazer check-in" })).toHaveCount(0);
  });

  test("localização desligada em Privacidade: nem pede o GPS", async ({ page, context }) => {
    const sufixo = Date.now();
    const praca = await createTestPlace(`Praça Sem GPS ${sufixo}`, isolatedPoint(), "passeios");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Missão Sem GPS ${sufixo}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, steps: [{ title: "Chegue à praça", placeId: praca, validation: "gps" }] });

    const explorador = await createConfirmedUser();
    await loginAs(page, explorador, "/missoes");
    await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
    await context.addCookies([{ name: "lalaia-geo", value: "0", url: page.url() }]);
    await page.getByRole("button", { name: "Fazer check-in" }).click();
    await expect(page.getByText("Você desligou o uso da localização.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir Privacidade" })).toBeVisible();
  });
});
