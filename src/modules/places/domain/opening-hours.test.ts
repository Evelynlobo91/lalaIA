import { describe, expect, it } from "vitest";
import { isOpenAt, parseOpeningHours } from "./opening-hours";

// Horários em Joinville (UTC-3). 2026-10-05 é segunda-feira.
const at = (isoLocal: string) => new Date(`${isoLocal}-03:00`);

describe("isOpenAt", () => {
  it("24/7 sempre aberto", () => {
    expect(isOpenAt("24/7", at("2026-10-04T03:00:00"))).toBe(true);
  });

  it.each([
    ["2026-10-05T12:00:00", true], // segunda, almoço
    ["2026-10-05T16:00:00", false], // segunda, fora do horário
    ["2026-10-10T12:00:00", true], // sábado
    ["2026-10-11T12:00:00", false], // domingo: não listado
  ])("Mo-Fr 11:00-14:30; Sa 11:00-15:00 em %s → %s", (time, expected) => {
    expect(isOpenAt("Mo-Fr 11:00-14:30; Sa 11:00-15:00", at(time))).toBe(expected);
  });

  it("faixa que atravessa a meia-noite vale na madrugada do dia seguinte", () => {
    const bar = "Tu-Sa 18:00-02:00";
    expect(isOpenAt(bar, at("2026-10-06T23:30:00"))).toBe(true); // terça à noite
    expect(isOpenAt(bar, at("2026-10-07T01:30:00"))).toBe(true); // quarta 1h30 (veio de terça)
    expect(isOpenAt(bar, at("2026-10-07T03:00:00"))).toBe(false);
    expect(isOpenAt(bar, at("2026-10-06T01:00:00"))).toBe(false); // terça 1h: segunda não abre
  });

  it("vários intervalos no dia e lista de dias", () => {
    const h = "Mo,We,Fr 09:00-12:00,14:00-18:00";
    expect(isOpenAt(h, at("2026-10-07T10:00:00"))).toBe(true); // quarta
    expect(isOpenAt(h, at("2026-10-07T13:00:00"))).toBe(false); // intervalo de almoço
    expect(isOpenAt(h, at("2026-10-06T10:00:00"))).toBe(false); // terça
  });

  it("regra posterior sobrescreve (Su off)", () => {
    expect(isOpenAt("Mo-Su 08:00-20:00; Su off", at("2026-10-11T10:00:00"))).toBe(false);
    expect(isOpenAt("Mo-Su 08:00-20:00; Su off", at("2026-10-10T10:00:00"))).toBe(true);
  });

  it("intervalo de dias que dá a volta na semana (Sa-Mo)", () => {
    expect(isOpenAt("Sa-Mo 10:00-16:00", at("2026-10-11T11:00:00"))).toBe(true); // domingo
    expect(isOpenAt("Sa-Mo 10:00-16:00", at("2026-10-07T11:00:00"))).toBe(false); // quarta
  });

  it("horário sem dias vale todos os dias", () => {
    expect(isOpenAt("08:00-18:00", at("2026-10-11T09:00:00"))).toBe(true);
  });

  it("usa o fuso de Joinville, não o do servidor", () => {
    // 2026-10-05T14:30Z = 11:30 em Joinville
    expect(isOpenAt("Mo 11:00-12:00", new Date("2026-10-05T14:30:00Z"))).toBe(true);
  });

  it("horário escrito em português (dados reais do OSM de Joinville)", () => {
    expect(isOpenAt("de 06:30 ás 20:00", at("2026-10-05T07:00:00"))).toBe(true);
    expect(isOpenAt("de 18:00 a 00:00", at("2026-10-05T21:00:00"))).toBe(true);
    expect(isOpenAt("de 18:00 a 00:00", at("2026-10-05T17:00:00"))).toBe(false);
  });

  it("feriados (PH) são ignorados e o restante vale; espaços após vírgula são aceitos", () => {
    const h = "Tu-Fr 09:00-17:00;Sa, Su, PH 12:00-18:00";
    expect(isOpenAt(h, at("2026-10-11T13:00:00"))).toBe(true); // domingo
    expect(isOpenAt(h, at("2026-10-05T13:00:00"))).toBe(false); // segunda
    expect(isOpenAt("PH off; Mo-Fr 08:00-17:00", at("2026-10-05T12:00:00"))).toBe(true);
  });

  it.each([null, "", "sunrise-sunset", "Mo-Fr 9h às 18h", "Mo-Fr 14:00+", "Su", "Mo 25:00-26:00"])("formato não reconhecido %j → null", (value) => {
    expect(isOpenAt(value, at("2026-10-05T12:00:00"))).toBeNull();
  });

  it("parseOpeningHours devolve regras por dia", () => {
    expect(parseOpeningHours("Mo-We 10:00-12:00")?.[0].days).toEqual(new Set([1, 2, 3]));
  });
});
