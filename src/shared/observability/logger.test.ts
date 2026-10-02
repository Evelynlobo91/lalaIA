import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./logger";
import { REDACTED, redact } from "./redact";
import { runWithRequestContext } from "./request-context";

function capture(level: LogLevel = "debug") {
  const lines: Array<Record<string, unknown>> = [];
  const log = createLogger({ level, now: () => new Date("2026-01-01T00:00:00Z"), write: (line) => lines.push(JSON.parse(line)) });
  return { log, lines };
}

describe("createLogger", () => {
  it("escreve uma linha JSON com time, level, msg e campos", () => {
    const { log, lines } = capture();
    log.info("lugar criado", { placeId: "p1" });
    expect(lines).toEqual([{ time: "2026-01-01T00:00:00.000Z", level: "info", msg: "lugar criado", placeId: "p1" }]);
  });

  it("respeita o nível mínimo", () => {
    const { log, lines } = capture("warn");
    log.debug("x");
    log.info("x");
    log.warn("w");
    log.error("e");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("child acumula campos fixos", () => {
    const { log, lines } = capture();
    log.child({ module: "places" }).child({ slice: "nearby" }).info("ok");
    expect(lines[0]).toMatchObject({ module: "places", slice: "nearby" });
  });

  it("inclui o requestId do contexto da requisição", () => {
    const { log, lines } = capture();
    runWithRequestContext({ requestId: "req-12345678" }, () => log.info("dentro"));
    log.info("fora");
    expect(lines[0].requestId).toBe("req-12345678");
    expect(lines[1].requestId).toBeUndefined();
  });

  it("mascara dados sensíveis e serializa erros", () => {
    const { log, lines } = capture();
    log.error("falhou", { email: "a@b.com", user: { senha: "123", nome: "Lala" }, err: new Error("boom") });
    expect(lines[0]).toMatchObject({ email: REDACTED, user: { senha: REDACTED, nome: "Lala" } });
    expect(lines[0].err).toMatchObject({ name: "Error", message: "boom" });
  });
});

describe("redact", () => {
  it("cobre chaves sensíveis comuns sem diferenciar maiúsculas", () => {
    const out = redact({ Authorization: "x", accessToken: "x", apiKey: "x", cpf: "x", telefone: "x", streamKey: "x", ok: 1 });
    expect(out).toEqual({ Authorization: REDACTED, accessToken: REDACTED, apiKey: REDACTED, cpf: REDACTED, telefone: REDACTED, streamKey: REDACTED, ok: 1 });
  });

  it("lida com referências circulares, arrays e datas", () => {
    const a: Record<string, unknown> = { when: new Date("2026-01-01T00:00:00Z"), list: [{ password: "x" }] };
    a.self = a;
    expect(redact(a)).toEqual({ when: "2026-01-01T00:00:00.000Z", list: [{ password: REDACTED }], self: "[circular]" });
  });
});
