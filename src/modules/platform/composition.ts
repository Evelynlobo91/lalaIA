// Composição do módulo platform (interna): usada pelo index.ts.
import { publicEnv } from "@/shared/config/public-env";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import { CheckHealth } from "./features/uptime/uptime.use-case";
import { AuthCheck, DatabaseCheck } from "./infra/health-checks";

/** Versão publicada (commit da Vercel, se houver). Não expõe nada sensível. */
const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

export const checkHealth = lazy(() => {
  const env = publicEnv();
  return new CheckHealth(
    [new DatabaseCheck(sql()), new AuthCheck(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)],
    logger().child({ module: "platform" }),
    version,
  );
});
