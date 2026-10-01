import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace, isolatedPoint } from "./support/db";
import { createConfirmedUser } from "./support/users";

test.describe("ME SURPREENDA (#74)", () => {
  test("monta o roteiro com ordem, deslocamento, justificativa e custo dentro do orçamento", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra do roteiro não depende da largura da tela");
    const tag = `${Date.now()}`;
    const ponto = isolatedPoint();
    const placeId = await createTestPlace(`Palco Surpresa ${tag}`, ponto, "shows");
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show grátis surpresa ${tag}`, startsInHours: -0.5, durationHours: 3, category: "shows" });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show caro surpresa ${tag}`, startsInHours: -0.5, durationHours: 3, category: "shows", priceCents: 8_000 });

    // Sem ANTHROPIC_API_KEY no ambiente de teste: o roteiro sai do motor local (fallback).
    await page.goto(`/surpreenda?tempo=180&orcamento=0&pessoas=1&lat=${ponto.lat.toFixed(4)}&lon=${ponto.lon.toFixed(4)}`);
    const roteiro = page.getByRole("list", { name: "Seu roteiro" });
    const parada = roteiro.getByRole("listitem").filter({ hasText: `Show grátis surpresa ${tag}` });
    await expect(parada).toBeVisible();
    await expect(parada).toContainText(/Uns \d+ min a pé/);
    await expect(parada).toContainText("Por quê:");
    await expect(parada).toContainText("Custo: Grátis");
    await expect(roteiro.getByText(`Show caro surpresa ${tag}`)).toHaveCount(0);
    await expect(page.getByText(/Custo estimado:/)).toBeVisible();
    await expect(page.getByText("Roteiro montado com o que está rolando agora.", { exact: false })).toBeVisible();
  });

  test("restrição inválida avisa e a API valida", async ({ page, request }) => {
    await page.goto("/surpreenda?tempo=5");
    await expect(page.getByText(/Tempo inválido/)).toBeVisible();
    expect((await request.get("/api/recommendations/surprise?tempo=5")).status()).toBe(400);
    const ok = await request.get("/api/recommendations/surprise?tempo=120&orcamento=sem");
    expect(ok.status()).toBe(200);
    expect(["claude", "motor"]).toContain((await ok.json()).source);
  });
});
