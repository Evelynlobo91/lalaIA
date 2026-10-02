import { describe, expect, it } from "vitest";
import { dateFilterParam, dateWindow } from "./date-window";

// Datas em Joinville (UTC-3). 2026-10-05 é segunda-feira.
const at = (local: string) => new Date(`${local}-03:00`);
const iso = (d: Date) => d.toISOString();

describe("dateWindow", () => {
  it("hoje e amanhã seguem o calendário de Joinville (23:30 ainda é hoje)", () => {
    const now = at("2026-10-05T23:30:00"); // já é dia 6 em UTC
    expect(dateWindow({ kind: "hoje" }, now)).toEqual({ from: at("2026-10-05T00:00:00"), to: at("2026-10-06T00:00:00") });
    expect(iso(dateWindow({ kind: "amanha" }, now).from)).toBe(iso(at("2026-10-06T00:00:00")));
  });

  it.each([
    ["segunda", "2026-10-05T10:00:00", "2026-10-10", "2026-10-12"],
    ["quarta", "2026-10-07T10:00:00", "2026-10-10", "2026-10-12"],
    ["sexta à noite", "2026-10-09T22:00:00", "2026-10-10", "2026-10-12"],
    ["sábado", "2026-10-10T15:00:00", "2026-10-10", "2026-10-12"],
    ["domingo", "2026-10-11T15:00:00", "2026-10-10", "2026-10-12"],
  ])("fim de semana numa %s → sábado a segunda 00:00", (_, now, from, to) => {
    expect(dateWindow({ kind: "fim-de-semana" }, at(now))).toEqual({ from: at(`${from}T00:00:00`), to: at(`${to}T00:00:00`) });
  });

  it("data específica, inclusive virada de mês e ano", () => {
    expect(dateWindow({ kind: "data", date: "2026-12-31" }, at("2026-10-05T10:00:00"))).toEqual({ from: at("2026-12-31T00:00:00"), to: at("2027-01-01T00:00:00") });
  });
});

describe("dateFilterParam", () => {
  it.each([
    [undefined, null],
    ["hoje", { kind: "hoje" }],
    ["fim-de-semana", { kind: "fim-de-semana" }],
    ["2026-10-10", { kind: "data", date: "2026-10-10" }],
  ])("%j → %j", (value, expected) => {
    expect(dateFilterParam.parse(value)).toEqual(expected);
  });

  it.each(["ontem", "2026-02-31", "10/10/2026", "2026-13-01"])("recusa %j", (value) => {
    expect(dateFilterParam.safeParse(value).success).toBe(false);
  });
});
