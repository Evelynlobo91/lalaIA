import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, err, ok } from "@/shared/kernel";
import type { SignUpGateway } from "../../domain/auth-gateway";
import { failedPasswordRules } from "../../domain/password-policy";
import { CURRENT_TERMS_VERSION } from "../../domain/terms";
import { registerSchema } from "./register.schema";
import { RegisterUser } from "./register.use-case";

const valid = { displayName: "Lala", email: "Lala@Exemplo.com ", password: "joinville2026", acceptTerms: "on" };

describe("política de senha", () => {
  it.each([
    ["curta1", ["min_length"]],
    ["somenteletras", ["digit"]],
    ["12345678", ["letter"]],
    ["ção12345", []],
    ["a1".repeat(37), ["max_length"]],
  ])("%s → regras falhando: %j", (password, expected) => {
    expect(failedPasswordRules(password).map((r) => r.id)).toEqual(expected);
  });
});

describe("registerSchema", () => {
  it("normaliza e-mail (trim + minúsculas) e nome", () => {
    const parsed = registerSchema.parse({ ...valid, displayName: "  Lala  " });
    expect(parsed).toMatchObject({ email: "lala@exemplo.com", displayName: "Lala" });
  });

  it("exige aceite dos termos", () => {
    const res = registerSchema.safeParse({ ...valid, acceptTerms: undefined });
    expect(res.success).toBe(false);
  });

  it("devolve todas as regras de senha não atendidas", () => {
    const res = registerSchema.safeParse({ ...valid, password: "abc" });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.message)).toEqual(["Pelo menos 8 caracteres", "Pelo menos um número"]);
  });

  it("recusa e-mail inválido", () => {
    expect(registerSchema.safeParse({ ...valid, email: "lala@" }).success).toBe(false);
  });
});

describe("RegisterUser", () => {
  const input = registerSchema.parse(valid);
  const publisher = (): DomainEventPublisher => ({ publish: vi.fn().mockResolvedValue(undefined) });
  const gateway = (result: Awaited<ReturnType<SignUpGateway["signUp"]>>): SignUpGateway => ({ signUp: vi.fn().mockResolvedValue(result) });

  it("cadastra com a versão vigente dos termos e o redirect de confirmação, e publica UserRegistered", async () => {
    const auth = gateway(ok({ kind: "created", userId: "u1", needsEmailConfirmation: true }));
    const events = publisher();

    const res = await new RegisterUser(auth, events).execute(input, "http://localhost:3000/auth/confirm");

    expect(res).toEqual({ ok: true, value: { needsEmailConfirmation: true } });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "lala@exemplo.com",
      password: "joinville2026",
      displayName: "Lala",
      termsVersion: CURRENT_TERMS_VERSION,
      emailRedirectTo: "http://localhost:3000/auth/confirm",
    });
    expect(events.publish).toHaveBeenCalledWith("identity.UserRegistered", { userId: "u1" });
  });

  it("e-mail já cadastrado: responde igual a um cadastro novo e não publica evento (anti-enumeração)", async () => {
    const events = publisher();
    const res = await new RegisterUser(gateway(ok({ kind: "undisclosed" })), events).execute(input, "x");

    expect(res).toEqual({ ok: true, value: { needsEmailConfirmation: true } });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("propaga erro de regra do provedor sem publicar evento", async () => {
    const events = publisher();
    const error = new BusinessRuleError("rate_limited", "Muitas tentativas.");
    const res = await new RegisterUser(gateway(err(error)), events).execute(input, "x");

    expect(res).toEqual({ ok: false, error });
    expect(events.publish).not.toHaveBeenCalled();
  });
});
