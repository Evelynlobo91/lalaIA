import "server-only";
import postgres from "postgres";
import { serverEnv } from "../config/server-env";

// Conexão única por processo. Só adaptadores em `modules/<x>/infra/` devem usá-la.
// Reaproveitada entre hot reloads em desenvolvimento para não esgotar conexões.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export function createSql(url: string): postgres.Sql {
  return postgres(url, { max: 10, idle_timeout: 20, prepare: false });
}

export function sql(): postgres.Sql {
  globalForDb.sql ??= createSql(serverEnv().DATABASE_URL);
  return globalForDb.sql;
}

export type Sql = postgres.Sql;
