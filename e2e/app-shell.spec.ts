import { expect, test } from "@playwright/test";

const destinos = [
  { label: "Mapa", path: "/mapa", heading: "Mapa" },
  { label: "Me Surpreenda", path: "/surpreenda", heading: "Me Surpreenda" },
  { label: "Missões", path: "/missoes", heading: "Missões" },
  { label: "Perfil", path: "/perfil", heading: "Perfil" },
  { label: "Explorar", path: "/", heading: "O que você quer fazer hoje?" },
];

test.describe("shell do app", () => {
  test("navega pelos destinos principais e marca o item ativo", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });

    for (const { label, path, heading } of destinos) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("não tem rolagem horizontal e a navegação fica visível", async ({ page }) => {
    for (const { path } of destinos) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(0);
      await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeInViewport();
    }
  });

  test("link de pular para o conteúdo aparece no primeiro Tab", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });

  test("captura de tela da home", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.screenshot({ path: testInfo.outputPath(`home-${testInfo.project.name}.png`), fullPage: true });
  });
});
