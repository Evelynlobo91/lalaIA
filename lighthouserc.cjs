// Orçamento de performance (#79, RNF03): Lighthouse CI nas páginas principais, em celular com 4G simulado.
// Roda contra o build de produção (o mesmo do E2E). O CI falha se algum limite for estourado.
const BASE = process.env.LHCI_BASE_URL ?? "http://localhost:3100";
const PLACE = process.env.LHCI_PLACE_ID; // um lugar real do seed, para medir a página de detalhe

module.exports = {
  ci: {
    collect: {
      url: [`${BASE}/`, `${BASE}/lugares`, `${BASE}/eventos`, `${BASE}/buscar?q=cafe`, ...(PLACE ? [`${BASE}/lugares/${PLACE}`] : [])],
      numberOfRuns: 3,
      settings: {
        // Celular (Moto G Power), "4G lento" do Lighthouse (562 ms de latência, 1,6 Mbps) e CPU 4× mais lenta.
        // Estrangulamento APLICADO (devtools), que mede a pintura real. O modo simulado (Lantern), rodando
        // contra localhost, atribui ao LCP todos os recursos baixados antes dele e superestima o LCP em 1–2 s
        // (LCP observado ~0,3 s × simulado ~3,5 s nas mesmas páginas).
        formFactor: "mobile",
        throttlingMethod: "devtools",
        locale: "pt-BR",
        chromeFlags: "--no-sandbox --headless=new",
      },
    },
    assert: {
      assertions: {
        // Critério da issue: LCP < 2,5 s em 4G simulado.
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median" }],
        "total-blocking-time": ["warn", { maxNumericValue: 300, aggregationMethod: "median" }],
        "categories:accessibility": ["error", { minScore: 0.9, aggregationMethod: "median" }],
        "categories:performance": ["warn", { minScore: 0.85, aggregationMethod: "median" }],
      },
    },
    upload: { target: "filesystem", outputDir: "./e2e/.lighthouse" },
  },
};
