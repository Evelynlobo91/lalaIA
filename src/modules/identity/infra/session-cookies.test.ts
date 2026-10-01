import { describe, expect, it } from "vitest";
import { secureCookies } from "./session-cookies";

describe("secureCookies", () => {
  it("Secure só quando o site é https (produção/preview); http (localhost/E2E) não", () => {
    expect(secureCookies("https://lalaia.app")).toBe(true);
    expect(secureCookies("http://localhost:3000")).toBe(false);
  });
});
