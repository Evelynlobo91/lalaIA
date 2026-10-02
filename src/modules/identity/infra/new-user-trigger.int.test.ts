import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";

const db = sql();
afterAll(() => db.end());

// Simula o que o Supabase Auth faz no signup: um insert em auth.users.
// Cada caso roda numa transação desfeita no final (não suja o banco local).
async function signUpRaw(meta: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const email = `teste-${id}@lalaia.test`;
  return db
    .begin(async (tx) => {
      await tx`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${tx.json(meta as never)})`;
      const [profile] = await tx`select display_name from identity.profiles where user_id = ${id}`;
      const [terms] = await tx`select terms_version, accepted_at from identity.terms_acceptances where user_id = ${id}`;
      throw { rollback: true, profile, terms };
    })
    .catch((e) => {
      if (e?.rollback) return { ok: true as const, profile: e.profile, terms: e.terms };
      return { ok: false as const, error: String(e.message ?? e) };
    });
}

describe("identity.handle_new_user (trigger do signup)", () => {
  it("cria perfil e aceite dos termos na mesma transação do cadastro", async () => {
    const before = Date.now();
    const res = await signUpRaw({ display_name: "  Lala  ", terms_version: "2026-09", terms_accepted_at: "2000-01-01T00:00:00Z" });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.display_name).toBe("Lala");
    expect(res.terms.terms_version).toBe("2026-09");
    // A data enviada pelo cliente é ignorada: vale a do servidor.
    expect(new Date(res.terms.accepted_at).getTime()).toBeGreaterThanOrEqual(before - 60_000);
  });

  it("usa o início do e-mail quando o nome não é informado", async () => {
    const res = await signUpRaw({ terms_version: "2026-09" });
    expect(res.ok && res.profile.display_name.startsWith("teste-")).toBe(true);
  });

  it("recusa cadastro sem aceite dos termos, mesmo chamando a API do Auth direto", async () => {
    const res = await signUpRaw({ display_name: "Sem termos" });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("terms_not_accepted") });
  });

  it("recusa versão de termos em formato inválido", async () => {
    const res = await signUpRaw({ terms_version: "qualquer" });
    expect(res.ok).toBe(false);
  });

  it("recusa nome com mais de 80 caracteres", async () => {
    const res = await signUpRaw({ terms_version: "2026-09", display_name: "x".repeat(81) });
    expect(res.ok).toBe(false);
  });

  it("tabelas do módulo não são acessíveis pelos papéis públicos da API", async () => {
    const [row] = await db`select has_schema_privilege('anon', 'identity', 'usage') as anon, has_schema_privilege('authenticated', 'identity', 'usage') as auth`;
    expect(row).toEqual({ anon: false, auth: false });
  });
});
