import { defineConfig, devices } from "@playwright/test";

// Porta própria: os testes rodam contra o build de produção, sem interferir no `npm run dev` (3000).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  // Larguras de referência do design (#20): celular, tablet e desktop.
  projects: [
    { name: "celular-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  // Sempre contra o build de produção (o dev server recompila sob demanda e deixa os testes instáveis).
  // No CI o build vem de um passo anterior; localmente, `npm run test:e2e` builda antes.
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
