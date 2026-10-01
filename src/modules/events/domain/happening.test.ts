import { describe, expect, it } from "vitest";
import { isHappeningAt, startedLabel, startsInLabel, startsSoon } from "./happening";

const at = new Date("2026-10-10T20:00:00Z");
const min = (m: number) => new Date(at.getTime() + m * 60_000);

describe("isHappeningAt", () => {
  it("começou e não terminou → acontecendo", () => {
    expect(isHappeningAt({ startsAt: min(-30), endsAt: min(30) }, at)).toBe(true);
  });

  it("início é inclusivo e fim é exclusivo", () => {
    expect(isHappeningAt({ startsAt: at, endsAt: min(60) }, at)).toBe(true);
    expect(isHappeningAt({ startsAt: min(-60), endsAt: at }, at)).toBe(false);
  });

  it("ainda não começou ou já terminou → não", () => {
    expect(isHappeningAt({ startsAt: min(1), endsAt: min(60) }, at)).toBe(false);
    expect(isHappeningAt({ startsAt: min(-120), endsAt: min(-1) }, at)).toBe(false);
  });
});

describe("startsSoon", () => {
  it("começa dentro das próximas 3 h (limite inclusivo)", () => {
    expect(startsSoon({ startsAt: min(1) }, at)).toBe(true);
    expect(startsSoon({ startsAt: min(180) }, at)).toBe(true);
  });

  it("depois de 3 h, ou já começado, não é 'em breve'", () => {
    expect(startsSoon({ startsAt: min(181) }, at)).toBe(false);
    expect(startsSoon({ startsAt: at }, at)).toBe(false);
    expect(startsSoon({ startsAt: min(-10) }, at)).toBe(false);
  });

  it("aceita outra janela", () => {
    expect(startsSoon({ startsAt: min(50) }, at, 30 * 60_000)).toBe(false);
  });
});

describe("rótulos de tempo", () => {
  it("tempo desde o início", () => {
    expect(startedLabel(at, min(0.5))).toBe("Começou agora");
    expect(startedLabel(at, min(25))).toBe("Começou há 25 min");
    expect(startedLabel(at, min(80))).toBe("Começou há 1 h 20 min");
    expect(startedLabel(at, min(180))).toBe("Começou há 3 h");
  });

  it("tempo até o início", () => {
    expect(startsInLabel(min(0.5), at)).toBe("Começa em instantes");
    expect(startsInLabel(min(40), at)).toBe("Começa em 40 min");
    expect(startsInLabel(min(130), at)).toBe("Começa em 2 h 10 min");
  });
});
