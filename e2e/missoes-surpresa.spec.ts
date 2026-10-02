import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestMission, createTestPlace, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Missões surpresa (#63): oferecidas por proximidade, com validade curta; aceitar ou ignorar; etapas uma por vez.
test.describe("missões surpresa", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("fora da lista; aparece perto da primeira etapa; aceitar revela só a próxima etapa", async ({ page, context }) => {
    const sufixo = Date.now();
    const ponto = isolatedPoint();
    const cafe = await createTestPlace(`Café Surpresa ${sufixo}`, ponto);
    const bar = await createTestPlace(`Bar Secreto ${sufixo}`, { lat: ponto.lat + 0.004, lon: ponto.lon }, "bares");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Surpresa ${sufixo}`;
    const { missionId } = await createTestMission({
      ownerEmail: parceiro.email,
      title: titulo,
      surprise: true,
      steps: [
        { title: "Peça o café do dia", placeId: cafe },
        { title: "Descubra o drinque secreto", placeId: bar },
      ],
    });

    const explorador = await createConfirmedUser("Exploradora Surpresa");
    await loginAs(page, explorador, "/missoes");
    // Não aparece na lista pública, e o link direto "não existe" sem a oferta.
    await expect(page.getByRole("region", { name: "Missões disponíveis" }).getByText(titulo)).toHaveCount(0);
    expect((await page.goto(`/missoes/${missionId}`))?.status()).toBe(404);

    await page.goto("/missoes");
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon, accuracy: 20 });
    await page.getByRole("button", { name: "Procurar missão surpresa por perto" }).click();
    const surpresa = page.getByRole("region", { name: "Missão surpresa" });
    await expect(surpresa.getByRole("heading", { name: titulo })).toBeVisible();
    await expect(surpresa.getByText(/Aceite até \d{2}:\d{2}/)).toBeVisible();
    await expect(surpresa.getByText("Peça o café do dia")).toHaveCount(0);

    await surpresa.getByRole("button", { name: `Aceitar a surpresa ${titulo}` }).click();
    await expect(page).toHaveURL(new RegExp(`/missoes/${missionId}\\?aceita=1$`));
    const etapas = page.getByRole("region", { name: "Etapas" });
    await expect(etapas.getByText("1. Peça o café do dia")).toBeVisible();
    await expect(etapas.getByText("2. Etapa surpresa")).toBeVisible();
    await expect(etapas.getByText("Descubra o drinque secreto")).toHaveCount(0);
    await expect(etapas.getByText(`Bar Secreto ${sufixo}`)).toHaveCount(0);
  });

  test("longe de tudo não aparece nada; ignorar faz a surpresa sumir de vez", async ({ page, context }) => {
    const sufixo = Date.now();
    const ponto = isolatedPoint();
    const praca = await createTestPlace(`Praça Surpresa ${sufixo}`, ponto, "passeios");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const titulo = `Surpresa Ignorada ${sufixo}`;
    await createTestMission({ ownerEmail: parceiro.email, title: titulo, surprise: true, steps: [{ title: "Ache o banco azul", placeId: praca }] });

    const explorador = await createConfirmedUser();
    await loginAs(page, explorador, "/missoes");
    await context.grantPermissions(["geolocation"]);
    // Canto sudoeste da área atendida: longe dos pontos isolados dos testes (fora do raio de 1 km).
    await context.setGeolocation({ latitude: -26.85, longitude: -49.55, accuracy: 20 });
    await page.getByRole("button", { name: "Procurar missão surpresa por perto" }).click();
    await expect(page.getByText("Nenhuma missão surpresa por perto agora.")).toBeVisible();

    await context.setGeolocation({ latitude: ponto.lat, longitude: ponto.lon, accuracy: 20 });
    await page.getByRole("button", { name: "Procurar missão surpresa por perto" }).click();
    const surpresa = page.getByRole("region", { name: "Missão surpresa" });
    await expect(surpresa.getByRole("heading", { name: titulo })).toBeVisible();
    await surpresa.getByRole("button", { name: `Ignorar a surpresa ${titulo}` }).click();
    await expect(surpresa.getByRole("heading", { name: titulo })).toHaveCount(0);

    // Procurar de novo no mesmo lugar não traz a ignorada de volta (outra surpresa de testes antigos pode aparecer).
    await page.getByRole("button", { name: "Procurar missão surpresa por perto" }).click();
    await expect(page.getByRole("status").or(surpresa.getByRole("heading"))).not.toHaveCount(0);
    await expect(surpresa.getByRole("heading", { name: titulo })).toHaveCount(0);
  });
});
