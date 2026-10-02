import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Fronteiras do monólito modular (ADR 0001 — docs/adr/0001-monolito-modular.md).
// - app/ e bootstrap/ (composição no boot) → pode usar shared/ e a API pública (index.ts) de qualquer módulo
// - modules/X → pode usar tudo do próprio módulo, shared/ e o index.ts de outros módulos
// - shared/   → só pode usar shared/ (kernel não conhece módulos)
const architecture = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "import/resolver": { typescript: { alwaysTryTypes: true } },
    "boundaries/elements": [
      { type: "app", pattern: "src/app" },
      { type: "app", pattern: "src/bootstrap" },
      { type: "module", pattern: "src/modules/*", capture: ["name"] },
      { type: "shared", pattern: "src/shared" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      2,
      {
        default: "disallow",
        policies: [
          {
            from: { element: { type: "app" } },
            allow: {
              to: [
                { element: { type: "app" } },
                { element: { type: "shared" } },
                { element: { type: "module", fileInternalPath: "index.ts" } },
              ],
            },
          },
          {
            from: { element: { type: "module" } },
            allow: {
              to: [
                { element: { type: "module", captured: { name: "{{from.element.captured.name}}" } } },
                { element: { type: "module", fileInternalPath: "index.ts" } },
                { element: { type: "shared" } },
              ],
            },
          },
          {
            from: { element: { type: "shared" } },
            allow: { to: { element: { type: "shared" } } },
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  architecture,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Arquivos de terceiros copiados no build (worker do MapLibre).
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
