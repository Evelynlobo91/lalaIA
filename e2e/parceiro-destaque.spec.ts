import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestPlace, isolatedPoint } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("destaque patrocinado (#29)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo do destaque roda só no celular");
  });

  test("plano sem destaque leva aos planos; com o Pro pago, o parceiro destaca o próprio lugar e encerra", async ({ page }) => {
    const lugar = `Bar e Restaurante em Destaque do Centro ${Date.now()}`;
    const dono = await createConfirmedUser("Dona do Destaque");
    await createApprovedPartner(dono, "Bar do Destaque");
    const placeId = await createTestPlace(lugar, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await loginAs(page, dono, "/parceiro/inicio");

    await page.getByRole("navigation", { name: "Portal do parceiro" }).getByRole("link", { name: "Destaque" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Destaque" })).toBeVisible();

    // No plano padrão (Básico) não há destaque: a tela explica e leva aos planos.
    await expect(page.getByText("O seu plano atual não inclui destaque.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Novo destaque" })).toHaveCount(0);
    await page.getByRole("link", { name: "Ver planos" }).click();
    await expect(page).toHaveURL(/\/parceiro\/assinatura$/);

    // Assina e paga o Pro (que libera o destaque).
    const pro = page.getByRole("article", { name: "Plano Pro" });
    await pro.getByRole("button", { name: "Fazer upgrade para o plano Pro" }).click();
    await pro.getByRole("link", { name: "Pagar agora" }).click();
    await page.getByRole("button", { name: "Simular pagamento" }).click();
    await expect(page.getByText("Pagamento simulado confirmado.")).toBeVisible();

    // Agora destaca o próprio lugar por 15 dias.
    await page.goto("/parceiro/destaque");
    const form = page.getByRole("form", { name: "Novo destaque" });
    // Nome comprido no seletor não alarga a página no celular.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await form.locator('select[name="target"]').selectOption({ label: `Lugar: ${lugar}` });
    await form.locator('select[name="days"]').selectOption("15");
    await form.getByRole("button", { name: "Destacar" }).click();
    await expect(page.getByText("Destaque no ar.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No ar (1)" })).toBeVisible();
    const noAr = page.getByRole("article", { name: `Destaque de ${lugar}` });
    await expect(noAr).toContainText("Lugar · até");

    // O mesmo lugar não entra duas vezes.
    await form.locator('select[name="target"]').selectOption({ label: `Lugar: ${lugar}` });
    await form.getByRole("button", { name: "Destacar" }).click();
    await expect(page.getByText("Este lugar ou evento já está em destaque.")).toBeVisible();

    // Encerra antes do fim do período.
    await noAr.getByRole("button", { name: `Encerrar o destaque de ${lugar}` }).click();
    await expect(page.getByRole("heading", { name: "No ar (0)" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Destaques anteriores" })).toContainText(lugar);
  });
});
