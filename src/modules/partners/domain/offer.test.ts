import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, formatOfferCode, generateOfferCode, normalizeOfferCode } from "./offer-code";
import { availabilityOf, remainingOf } from "./offer";

describe("código de resgate", () => {
  it("tem 8 símbolos do alfabeto sem caracteres ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOfferCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("descarta bytes que enviesariam o sorteio", () => {
    // 255 está acima do limite (248) e é descartado; 0 → "2", 31 → "2" (31 % 31), 30 → "Z".
    const bytes = [255, 0, 31, 30, 255, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const code = generateOfferCode((b) => b.map((_, i) => bytes[i] ?? 0));
    expect(code).toBe("22Z34567");
  });

  it("normaliza o que o parceiro digita e recusa o que não pode ser código", () => {
    expect(normalizeOfferCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeOfferCode("ABCD EFGH")).toBe("ABCDEFGH");
    expect(normalizeOfferCode("ABCD-EFG0")).toBeNull();
    expect(normalizeOfferCode("ABC")).toBeNull();
    expect(normalizeOfferCode("'; drop table--")).toBeNull();
  });

  it("formata em dois blocos", () => {
    expect(formatOfferCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});

describe("disponibilidade da oferta", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  const base = { status: "active" as const, startsAt: new Date("2026-10-10T00:00:00Z"), endsAt: new Date("2026-10-11T00:00:00Z"), maxRedemptions: 10, redeemedCount: 3 };

  it.each([
    [{}, "available"],
    [{ status: "ended" as const }, "ended"],
    [{ startsAt: new Date("2026-10-10T16:00:00Z") }, "upcoming"],
    [{ endsAt: now }, "expired"],
    [{ redeemedCount: 10 }, "sold_out"],
    [{ maxRedemptions: null, redeemedCount: 5000 }, "available"],
  ] as const)("%o → %s", (patch, expected) => {
    expect(availabilityOf({ ...base, ...patch }, now)).toBe(expected);
  });

  it("calcula os resgates restantes", () => {
    expect(remainingOf(base)).toBe(7);
    expect(remainingOf({ maxRedemptions: null, redeemedCount: 3 })).toBeNull();
  });
});
