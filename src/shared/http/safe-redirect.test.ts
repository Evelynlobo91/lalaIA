import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/mapa", "/mapa"],
    ["/eventos/1?aba=live#player", "/eventos/1?aba=live#player"],
  ])("aceita caminho interno %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "mapa"])(
    "bloqueia %s e usa o fallback",
    (input) => {
      expect(safeRedirectPath(input, "/inicio")).toBe("/inicio");
    },
  );
});
