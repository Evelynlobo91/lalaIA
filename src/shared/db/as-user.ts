import "server-only";
import type postgres from "postgres";
import { sql } from "./sql";

export type Tx = postgres.TransactionSql;

/**
 * Executa consultas numa transação **como o usuário** (papel `authenticated` + `auth.uid()` = userId),
 * para que as políticas RLS das tabelas valham também no backend.
 *
 * Use em tabelas com dono (ex.: eventos de um parceiro): mesmo que um caso de uso esqueça o filtro
 * por dono, o banco não deixa ler/alterar dados de outra pessoa. É a segunda camada de proteção;
 * a primeira continua sendo a checagem no caso de uso.
 *
 * O userId deve vir SEMPRE da sessão validada (getCurrentUser/withUser), nunca de entrada do cliente.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, db: postgres.Sql = sql()): Promise<T> {
  return db.begin(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}
