import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestMission, createTestPlace, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// "Missões para você" (#64): ordenadas por relevância, com o motivo, respeitando tempo e orçamento.
test.describe("missões recomendadas", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("perto e no tempo vem primeiro, com o motivo; a demorada e a cara ficam de fora", async ({ page }) => {
    const sufixo = Date.now();
    const ponto = isolatedPoint();
    const cafe = await createTestPlace(`Café Rec ${sufixo}`, ponto, "cafes");
    const parceiro = await createConfirmedUser();
    await createApprovedPartner(parceiro);
    const rapida = `Rápida ${sufixo}`;
    const demorada = `Demorada ${sufixo}`;
    const cara = `Cara ${sufixo}`;
    await createTestMission({ ownerEmail: parceiro.email, title: rapida, estimatedMinutes: 40, costCents: 0, steps: [{ title: "Peça um café", placeId: cafe }] });
    await createTestMission({ ownerEmail: parceiro.email, title: demorada, estimatedMinutes: 300, costCents: 0, steps: [{ title: "Peça um café", placeId: cafe }] });
    await createTestMission({ ownerEmail: parceiro.email, title: cara, estimatedMinutes: 40, costCents: 15_000, steps: [{ title: "Peça um café", placeId: cafe }] });

    const explorador = await createConfirmedUser();
    await loginAs(page, explorador, "/missoes");
    await page.goto(`/missoes?tempo=60&orcamento=50&pessoas=1&lat=${ponto.lat.toFixed(4)}&lon=${ponto.lon.toFixed(4)}`);

    const lista = page.getByRole("list", { name: "Missões ordenadas para você" });
    const card = lista.getByRole("link", { name: new RegExp(rapida) });
    await expect(card).toBeVisible();
    await expect(card.getByRole("list", { name: "Por que sugerimos" })).toContainText(/de você|cabe no seu tempo/);
    await expect(card).toContainText("Grátis");
    await expect(lista.getByText(demorada)).toHaveCount(0);
    await expect(lista.getByText(cara)).toHaveCount(0);
    // A lista completa continua lá embaixo.
    await expect(page.getByRole("region", { name: "Missões disponíveis" }).getByRole("heading", { name: demorada })).toBeVisible();
  });

  test("também aparece em /sugestoes e a API valida os parâmetros", async ({ page, request }) => {
    await page.goto("/sugestoes?tempo=120");
    await expect(page.getByRole("heading", { name: /Missões para você/ })).toBeVisible();

    const ok = await request.get("/api/recommendations/missions?tempo=120&orcamento=sem");
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(item.kind).toBe("mission");
      expect(item.reasons.length).toBeGreaterThan(0);
    }
    expect((await request.get("/api/recommendations/missions?tempo=abc")).status()).toBe(400);
  });
});
