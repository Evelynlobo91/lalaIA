import { defineConfig, devices } from "@playwright/test";

// Porta própria: os testes rodam contra o build de produção, sem interferir no `npm run dev` (3000).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  // Localmente o Supabase completo roda no Docker junto do app e dos navegadores. Em máquinas com
  // pouca RAM, mais de 2 navegadores simultâneos causava travadas de segundos (troca de memória
  // com o disco) e testes instáveis. No CI (recursos dedicados) o Playwright decide sozinho.
  workers: CI ? undefined : 2,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : "list",
  // Fluxos de conta passam por Supabase Auth + banco; 5s (padrão) é justo demais com o servidor frio.
  expect: { timeout: 10_000 },
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
    // Compatibilidade (#80, RNF12): os fluxos críticos também no Safari (WebKit, iPhone) e no Firefox.
    { name: "safari-iphone", timeout: 60_000, testMatch: /fluxos-criticos\.spec\.ts/, use: { ...devices["iPhone 13"] } },
    { name: "firefox-desktop", timeout: 60_000, testMatch: /fluxos-criticos\.spec\.ts/, use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } } },
  ],
  // Sempre contra o build de produção (o dev server recompila sob demanda e deixa os testes instáveis).
  // No CI o build vem de um passo anterior; localmente, `npm run test:e2e` builda antes.
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    // E2E_SERVER_LOGS=1 mostra os logs do servidor junto dos testes (útil para investigar lentidão).
    stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
  },
});
