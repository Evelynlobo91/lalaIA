import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Lê os tokens direto do globals.css (fonte única) e verifica contraste WCAG AA nos dois temas.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, hex]) => [name, hex]));
}

const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))));
const darkStart = css.indexOf(":root {", css.indexOf("prefers-color-scheme: dark"));
const dark = tokens(css.slice(darkStart, css.indexOf("}", darkStart)));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [texto, fundo, mínimo]: 4.5 para texto normal; 3 para bordas de foco/elementos gráficos.
const pairs: Array<[string, string, number]> = [
  ["fg", "bg", 4.5],
  ["fg", "surface", 4.5],
  ["fg", "surface-2", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["brand", "bg", 4.5],
  ["brand", "surface", 4.5],
  ["brand-fg", "brand", 4.5],
  ["accent-fg", "accent", 4.5],
  ["success-fg", "success", 4.5],
  ["warning-fg", "warning", 4.5],
  ["danger-fg", "danger", 4.5],
  ["live-fg", "live", 4.5],
  ["focus", "bg", 3],
];

describe.each([
  ["claro", light],
  ["escuro", dark],
])("tema %s", (_, theme) => {
  it("define todos os tokens usados", () => {
    for (const [a, b] of pairs) {
      expect(theme[a], a).toBeDefined();
      expect(theme[b], b).toBeDefined();
    }
  });

  it.each(pairs)("%s sobre %s tem contraste ≥ %d", (fg, bg, min) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
  });
});
