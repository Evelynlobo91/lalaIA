import { expect, test } from "@playwright/test";
import { addFavorite, createApprovedPartner, createTestEvent, createTestMission, createTestPlace, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

type Feature = { properties: { id: string; state: string } };

test.describe("mapa de exploração (#69)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regras do mapa não dependem da largura da tela");
  });

  test("cada lugar com a situação da pessoa, legenda com liga/desliga e lista alternativa", async ({ page }) => {
    const tag = `${Date.now()}`;
    const pessoa = await createConfirmedUser();
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const conhecido = await createTestPlace(`Café Conhecido ${tag}`, isolatedPoint());
    const especial = await createTestPlace(`Bar Especial ${tag}`, isolatedPoint());
    const palco = await createTestPlace(`Palco Agora ${tag}`, isolatedPoint());
    await addFavorite(pessoa, "place", conhecido);
    await createTestMission({ ownerEmail: dono.email, title: `Missão Mapa ${tag}`, steps: [{ title: "Passe no bar", placeId: especial }] });
    await createTestEvent({ ownerEmail: dono.email, placeId: palco, title: `Show Mapa ${tag}`, startsInHours: -0.5, durationHours: 2 });

    await loginAs(page, pessoa, "/perfil");
    await page.getByRole("link", { name: "Meu mapa" }).click();
    await expect(page.getByRole("heading", { name: "Meu mapa de exploração" })).toBeVisible();

    // Dados da camada (mesma sessão).
    const geo = (await (await page.request.get("/api/progression/game-map")).json()) as { features: Feature[] };
    const state = (id: string) => geo.features.find((f) => f.properties.id === id)?.properties.state;
    expect(state(conhecido)).toBe("conhecido");
    expect(state(especial)).toBe("especial");
    expect(state(palco)).toBe("evento");

    // Legenda e liga/desliga (estado na URL).
    const camadas = page.getByRole("group", { name: "Seu mapa de descobertas" });
    await expect(camadas.getByLabel(/Conhecido/)).toBeChecked();
    await camadas.getByLabel(/Não explorado/).uncheck();
    await expect(page).toHaveURL(/camadas=/);
    expect(new URL(page.url()).searchParams.get("camadas")).not.toContain("inexplorado");
    await expect(page.getByRole("region", { name: /Mapa de exploração/ })).toHaveAttribute("data-ready", "true");

    // Ao recarregar com a URL, a escolha se mantém.
    await page.reload();
    await expect(page.getByRole("group", { name: "Seu mapa de descobertas" }).getByLabel(/Não explorado/)).not.toBeChecked();

    // Alternativa em lista.
    await page.getByText(/Ver em lista/).click();
    await expect(page.getByRole("link", { name: `Café Conhecido ${tag}` })).toBeVisible();
  });

  test("a API do mapa exige sessão", async ({ request }) => {
    expect((await request.get("/api/progression/game-map")).status()).toBe(401);
  });
});
