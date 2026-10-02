import { describe, expect, it } from "vitest";
import { formatDateTime, fromLocalInput, sameLocalDay, toLocalInput } from "./joinville-time";

describe("horário de Joinville", () => {
  it("20:00 em Joinville = 23:00 UTC (UTC-3)", () => {
    expect(fromLocalInput("2026-10-10T20:00")?.toISOString()).toBe("2026-10-10T23:00:00.000Z");
  });

  it("ida e volta com o formulário", () => {
    expect(toLocalInput(new Date("2026-10-10T23:00:00Z"))).toBe("2026-10-10T20:00");
    expect(toLocalInput(fromLocalInput("2026-12-31T23:30")!)).toBe("2026-12-31T23:30");
  });

  it.each(["", "2026-10-10", "2026-10-10 20:00", "2026-02-31T10:00", "2026-10-10T25:00"])("texto inválido %j → null", (value) => {
    expect(fromLocalInput(value)).toBeNull();
  });

  it("formata em português e compara dias no fuso local", () => {
    expect(formatDateTime(new Date("2026-10-10T23:00:00Z"))).toMatch(/10 de out\.?,? 20:00/);
    // 01:30 UTC do dia 11 ainda é dia 10 em Joinville.
    expect(sameLocalDay(new Date("2026-10-11T01:30:00Z"), new Date("2026-10-10T12:00:00Z"))).toBe(true);
  });
});
