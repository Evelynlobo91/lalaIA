import type { Sql } from "@/shared/db/sql";
import type { AccountDeleter, PersonalDataSource } from "../features/lgpd/lgpd.use-case";

/** Apaga a conta no Supabase Auth; as tabelas dos módulos referenciam `auth.users` e saem em cascata. */
export class PostgresAccountDeleter implements AccountDeleter {
  constructor(private readonly sql: Sql) {}

  async delete(userId: string): Promise<void> {
    await this.sql`delete from auth.users where id = ${userId}`;
  }
}

/** Dados do próprio módulo identity: cadastro, perfil, preferências, consentimentos, termos e papéis. */
export class IdentityPersonalData implements PersonalDataSource {
  readonly name = "conta";
  constructor(private readonly sql: Sql) {}

  async export(user: { id: string }): Promise<unknown> {
    const [account] = await this.sql<{ email: string; created_at: Date; last_sign_in_at: Date | null }[]>`
      select email, created_at, last_sign_in_at from auth.users where id = ${user.id}`;
    const [profile] = await this.sql`select display_name, avatar_path, created_at from identity.profiles where user_id = ${user.id}`;
    const [preferences] = await this.sql`select categories, budget_max, radius_km, group_size, updated_at from identity.preferences where user_id = ${user.id}`;
    const [consents] = await this.sql`select analytics, geolocation, updated_at from identity.consents where user_id = ${user.id}`;
    const terms = await this.sql`select terms_version, accepted_at from identity.terms_acceptances where user_id = ${user.id} order by accepted_at`;
    const roles = await this.sql`select role, granted_at from identity.user_roles where user_id = ${user.id} order by role`;
    return {
      cadastro: account ? { email: account.email, criadoEm: account.created_at, ultimoAcesso: account.last_sign_in_at } : null,
      perfil: profile ?? null,
      preferencias: preferences ?? null,
      consentimentos: consents ?? "padrão (nunca alterados)",
      termosAceitos: terms,
      papeis: roles,
    };
  }
}
