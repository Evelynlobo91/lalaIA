import { describe, expect, it } from "vitest";
import { openWindow } from "./availability";

const now = new Date("2026-10-10T20:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);
/** Aberto em [abre, fecha) minutos a partir de agora. */
const openBetween = (opens: number, closes: number) => (at: Date) => at >= min(opens) && at < min(closes);

describe("openWindow", () => {
  it("aberto o período todo → janela inteira", () => {
    expect(openWindow(() => true, now, min(120))).toEqual({ known: true, window: { start: now, end: min(120) } });
  });

  it("fechando: o fim é a última sondagem ainda aberta (conservador)", () => {
    expect(openWindow(openBetween(-60, 25), now, min(120))).toEqual({ known: true, window: { start: now, end: min(20) } });
  });

  it("fechado agora mas abrindo dentro do período", () => {
    expect(openWindow(openBetween(30, 600), now, min(120))).toEqual({ known: true, window: { start: min(30), end: min(120) } });
  });

  it("fechado o período todo → janela nula", () => {
    expect(openWindow(() => false, now, min(120))).toEqual({ known: true, window: null });
  });

  it("horário não reconhecido → desconhecido", () => {
    expect(openWindow(() => null, now, min(120))).toEqual({ known: false });
  });
});
