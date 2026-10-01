import { describe, expect, it } from "vitest";
import { printTokenExpiry, screenTokenExpiry } from "../domain/step-validation";
import { HmacStepTokens } from "./hmac-step-tokens";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
const STEP = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const now = new Date("2026-10-15T15:00:30Z");
const in5min = new Date(now.getTime() + 5 * 60_000);
const tokens = new HmacStepTokens(SECRET);

const code = (r: { ok: boolean; error?: { code: string } } | { ok: true; value: unknown }) => ("error" in r && r.error ? r.error.code : "ok");

describe("HmacStepTokens", () => {
  it("assina e verifica: devolve a etapa e a expiração", () => {
    const token = tokens.sign(STEP, in5min);
    const res = tokens.verify(token, now);
    expect(res.ok && res.value.stepId).toBe(STEP);
    expect(res.ok && res.value.expiresAt.getTime()).toBe(Math.floor(in5min.getTime() / 1000) * 1000);
    expect(tokens.claimedStepId(token)).toBe(STEP);
    expect(token.length).toBeLessThan(80);
  });

  it("recusa assinatura inválida: etapa, expiração ou assinatura adulteradas", () => {
    const token = tokens.sign(STEP, in5min);
    const [step, exp, sig] = token.split(".");
    const otherStep = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
    expect(code(tokens.verify(`${otherStep}.${exp}.${sig}`, now))).toBe("qr_invalid");
    expect(code(tokens.verify(`${step}.${Number(exp) + 3600}.${sig}`, now))).toBe("qr_invalid");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(code(tokens.verify(`${step}.${exp}.${flipped}`, now))).toBe("qr_invalid");
  });

  it("recusa token assinado com outro segredo", () => {
    const forged = new HmacStepTokens("outro-segredo-qualquer-com-32-caracteres-ou-mais").sign(STEP, in5min);
    expect(code(tokens.verify(forged, now))).toBe("qr_invalid");
  });

  it("recusa token expirado", () => {
    const token = tokens.sign(STEP, new Date(now.getTime() - 1000));
    expect(code(tokens.verify(token, now))).toBe("qr_expired");
  });

  it("recusa validade longa demais, mesmo bem assinada", () => {
    const token = tokens.sign(STEP, new Date(now.getTime() + 30 * 3600_000));
    expect(code(tokens.verify(token, now))).toBe("qr_invalid");
  });

  it.each(["", "abc", `${STEP}.123`, `${STEP}.abc.${"A".repeat(22)}`, `../../${STEP}.1.${"A".repeat(22)}`])("recusa formato inválido %j", (token) => {
    expect(code(tokens.verify(token, now))).toBe("qr_invalid");
    if (!token.startsWith(STEP) || token.split(".").length !== 3) expect(tokens.claimedStepId(token)).toBeNull();
  });

  it("não aceita segredo curto", () => {
    expect(() => new HmacStepTokens("curto")).toThrow(/mínimo 32/);
  });
});

describe("política de validade do QR", () => {
  it("QR da tela: alinhado ao minuto (todos veem o mesmo) e vale de 4 a 5 minutos", () => {
    const a = screenTokenExpiry(new Date("2026-10-15T15:00:01Z"));
    const b = screenTokenExpiry(new Date("2026-10-15T15:00:59Z"));
    expect(a).toEqual(b);
    expect(a.toISOString()).toBe("2026-10-15T15:05:00.000Z");
    expect(screenTokenExpiry(new Date("2026-10-15T15:01:01Z")).toISOString()).toBe("2026-10-15T15:06:00.000Z");
  });

  it("QR impresso: vale até 23:59:59 de hoje em Joinville", () => {
    // 15/10 12:00 em Joinville (UTC−3) → até 15/10 23:59:59 local = 16/10 02:59:59 UTC.
    expect(printTokenExpiry(new Date("2026-10-15T15:00:00Z")).toISOString()).toBe("2026-10-16T02:59:59.000Z");
  });
});
