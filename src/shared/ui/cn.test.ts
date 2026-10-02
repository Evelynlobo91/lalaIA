import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("ignora valores falsos", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("a classe passada por último vence conflitos, inclusive com as cores do tema", () => {
    expect(cn("rounded-2xl bg-surface p-4", "bg-brand text-brand-fg")).toBe("rounded-2xl p-4 bg-brand text-brand-fg");
    expect(cn("bg-brand text-brand-fg h-12", "bg-accent text-accent-fg")).toBe("h-12 bg-accent text-accent-fg");  });
});
