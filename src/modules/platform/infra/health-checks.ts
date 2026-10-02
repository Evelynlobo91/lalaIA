import type { Sql } from "@/shared/db/sql";
import type { HealthCheck } from "../domain/health";

/** Banco (crítico): uma consulta trivial. Sem banco, nada no app funciona. */
export class DatabaseCheck implements HealthCheck {
  readonly name = "banco";
  readonly critical = true;
  constructor(private readonly sql: Sql) {}

  async run(): Promise<void> {
    await this.sql`select 1`;
  }
}

/** Login (não crítico): endpoint de saúde do Supabase Auth. Fora do ar, o resto do app ainda navega. */
export class AuthCheck implements HealthCheck {
  readonly name = "autenticacao";
  readonly critical = false;
  constructor(
    private readonly supabaseUrl: string,
    private readonly apiKey: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    const res = await this.doFetch(`${this.supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: this.apiKey }, signal, cache: "no-store" });
    if (!res.ok) throw new Error(`auth respondeu ${res.status}`);
  }
}
