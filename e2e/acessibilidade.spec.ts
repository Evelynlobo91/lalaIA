import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// RNF02 (#82): nenhuma violação crítica ou séria do axe (WCAG 2.1 A/AA) nas telas principais.
// O canvas do mapa (MapLibre) é visual e tem alternativa em lista; ele fica fora da varredura.
async function scan(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".maplibregl-canvas-container")
    .analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  return blocking.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

test.describe("acessibilidade (axe, #82)", () => {
  test.beforeEach(({}, testInfo) => {
    // Celular e desktop: o layout muda (navegação inferior × lateral).
    test.skip(testInfo.project.name === "tablet-768", "celular e desktop cobrem os dois layouts");
    test.setTimeout(240_000); // varre várias páginas por teste
  });

  test("páginas públicas", async ({ page }) => {
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Café Acessível ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Acessível ${tag}`, startsInHours: 2, durationHours: 2 });

    const pages = ["/", "/lugares", `/lugares/${placeId}`, "/eventos", "/eventos/agora", `/eventos/${eventId}`, "/buscar?q=cafe", "/sugestoes", "/surpreenda", "/ao-vivo", "/missoes", "/status", "/entrar", "/cadastro"];
    const problems: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      problems.push(...(await scan(page)).map((p) => `${path}: ${p}`));
    }
    expect(problems).toEqual([]);
  });

  test("páginas logadas e do parceiro", async ({ page }) => {
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await loginAs(page, dono, "/perfil");

    const pages = ["/perfil", "/perfil/editar", "/perfil/favoritos", "/perfil/privacidade", "/perfil/mapa", "/parceiro/inicio", "/parceiro/eventos", "/parceiro/live", "/parceiro/missoes", "/parceiro/dados"];
    const problems: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      problems.push(...(await scan(page)).map((p) => `${path}: ${p}`));
    }
    expect(problems).toEqual([]);
  });
});
