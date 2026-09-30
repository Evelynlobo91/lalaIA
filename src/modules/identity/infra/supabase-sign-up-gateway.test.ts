import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseSignUpGateway } from "./supabase-sign-up-gateway";

const request = { email: "a@b.com", password: "senha1234", displayName: "Lala", termsVersion: "2026-09", emailRedirectTo: "http://x/auth/confirm" };

function client(response: { data?: unknown; error?: unknown }) {
  const signUp = vi.fn().mockResolvedValue({ data: response.data ?? { user: null, session: null }, error: response.error ?? null });
  return { signUp, gateway: new SupabaseSignUpGateway({ auth: { signUp } } as unknown as SupabaseClient) };
}

describe("SupabaseSignUpGateway", () => {
  it("envia nome e versão dos termos como metadados e o redirect de confirmação", async () => {
    const { signUp, gateway } = client({ data: { user: { id: "u1", identities: [{}] }, session: null } });

    const res = await gateway.signUp(request);

    expect(signUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "senha1234",
      options: { emailRedirectTo: "http://x/auth/confirm", data: { display_name: "Lala", terms_version: "2026-09" } },
    });
    expect(res).toEqual({ ok: true, value: { kind: "created", userId: "u1", needsEmailConfirmation: true } });
  });

  it("sem confirmação de e-mail (sessão criada) → needsEmailConfirmation false", async () => {
    const { gateway } = client({ data: { user: { id: "u1", identities: [{}] }, session: { access_token: "t" } } });
    expect(await gateway.signUp(request)).toEqual({ ok: true, value: { kind: "created", userId: "u1", needsEmailConfirmation: false } });
  });

  it("usuário sem identidades (e-mail existente com confirmação ativa) → undisclosed", async () => {
    const { gateway } = client({ data: { user: { id: "fantasma", identities: [] }, session: null } });
    expect(await gateway.signUp(request)).toEqual({ ok: true, value: { kind: "undisclosed" } });
  });

  it.each(["user_already_exists", "over_email_send_rate_limit"])("erro %s → undisclosed (não revela que o e-mail existe)", async (code) => {
    const { gateway } = client({ error: { code, message: "x" } });
    expect(await gateway.signUp(request)).toEqual({ ok: true, value: { kind: "undisclosed" } });
  });

  it.each([
    ["weak_password", "weak_password"],
    ["over_request_rate_limit", "rate_limited"],
    ["email_address_invalid", "invalid_email"],
  ])("erro conhecido %s → BusinessRuleError %s", async (supabaseCode, code) => {
    const { gateway } = client({ error: { code: supabaseCode, message: "x" } });
    const res = await gateway.signUp(request);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(code);
  });

  it("erro desconhecido é lançado (tratado como inesperado e reportado)", async () => {
    const { gateway } = client({ error: { code: "unexpected_failure", message: "Database error saving new user" } });
    await expect(gateway.signUp(request)).rejects.toMatchObject({ code: "unexpected_failure" });
  });
});
