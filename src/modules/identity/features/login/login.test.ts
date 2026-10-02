import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { BusinessRuleError, err, ok } from "@/shared/kernel";
import type { ProfileReader, SessionGateway } from "../../domain/session";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";
import { resolveCurrentUser } from "../session/current-user";
import { loginSchema } from "./login.schema";
import { LoginUser } from "./login.use-case";

const sessions = (overrides: Partial<SessionGateway> = {}): SessionGateway => ({
  signIn: vi.fn().mockResolvedValue(ok({ userId: "u1" })),
  signOut: vi.fn(),
  currentUserId: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe("LoginUser", () => {
  it("autentica com e-mail normalizado e volta para o caminho interno pedido", async () => {
    const gateway = sessions();
    const input = loginSchema.parse({ email: " Lala@Exemplo.com ", password: "joinville2026", next: "/perfil" });

    expect(await new LoginUser(gateway).execute(input)).toEqual({ ok: true, value: { redirectTo: "/perfil" } });
    expect(gateway.signIn).toHaveBeenCalledWith("lala@exemplo.com", "joinville2026");
  });

  it.each(["https://evil.com", "//evil.com", undefined])("next %s inseguro ou ausente → volta para a home", async (next) => {
    const input = loginSchema.parse({ email: "a@b.com", password: "x", next });
    expect(await new LoginUser(sessions()).execute(input)).toEqual({ ok: true, value: { redirectTo: "/" } });
  });

  it("propaga credencial inválida", async () => {
    const error = new BusinessRuleError("invalid_credentials", "E-mail ou senha incorretos.");
    const input = loginSchema.parse({ email: "a@b.com", password: "x" });
    expect(await new LoginUser(sessions({ signIn: vi.fn().mockResolvedValue(err(error)) })).execute(input)).toEqual({ ok: false, error });
  });
});

describe("SupabaseSessionGateway.signIn", () => {
  const gateway = (response: { data?: unknown; error?: unknown }) =>
    new SupabaseSessionGateway({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: response.data ?? { user: null }, error: response.error ?? null }) },
    } as unknown as SupabaseClient);

  it("sucesso devolve o id do usuário", async () => {
    expect(await gateway({ data: { user: { id: "u1" } } }).signIn("a@b.com", "x")).toEqual({ ok: true, value: { userId: "u1" } });
  });

  it.each([
    ["invalid_credentials", "invalid_credentials"],
    ["user_banned", "invalid_credentials"],
    ["email_not_confirmed", "email_not_confirmed"],
    ["over_request_rate_limit", "rate_limited"],
  ])("erro %s → %s", async (supabaseCode, code) => {
    const res = await gateway({ error: { code: supabaseCode } }).signIn("a@b.com", "x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(code);
  });

  it("credencial inválida e conta banida têm a mesma mensagem (não revela o motivo)", async () => {
    const a = await gateway({ error: { code: "invalid_credentials" } }).signIn("a@b.com", "x");
    const b = await gateway({ error: { code: "user_banned" } }).signIn("a@b.com", "x");
    expect(!a.ok && !b.ok && a.error.message === b.error.message).toBe(true);
  });

  it("erro desconhecido é lançado (inesperado)", async () => {
    await expect(gateway({ error: { code: "unexpected_failure" } }).signIn("a@b.com", "x")).rejects.toMatchObject({ code: "unexpected_failure" });
  });
});

describe("resolveCurrentUser", () => {
  const profiles = (name: string | null): ProfileReader => ({ displayNameOf: vi.fn().mockResolvedValue(name) });

  it("sem sessão → null, sem consultar o perfil", async () => {
    const reader = profiles("Lala");
    expect(await resolveCurrentUser(sessions(), reader)).toBeNull();
    expect(reader.displayNameOf).not.toHaveBeenCalled();
  });

  it("com sessão → usuário com nome do perfil", async () => {
    const s = sessions({ currentUserId: vi.fn().mockResolvedValue({ id: "u1", email: "lala@b.com" }) });
    expect(await resolveCurrentUser(s, profiles("Lala"))).toEqual({ id: "u1", email: "lala@b.com", displayName: "Lala" });
  });

  it("perfil ausente → usa o início do e-mail", async () => {
    const s = sessions({ currentUserId: vi.fn().mockResolvedValue({ id: "u1", email: "lala@b.com" }) });
    expect((await resolveCurrentUser(s, profiles(null)))?.displayName).toBe("lala");
  });
});
