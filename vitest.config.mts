import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverOnlyStub = fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Nos testes, código "server-only" é importável (o guard continua valendo no bundle do Next).
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "docs/templates/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
        },
      },
      {
        // Testes de integração: exigem o Supabase local rodando (npm run db:start).
        extends: true,
        test: {
          name: "int",
          include: ["src/**/*.int.test.ts"],
          // Todos compartilham o mesmo banco: arquivos em paralelo interferem nas contagens uns dos outros.
          fileParallelism: false,
          env: { DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
        },
      },
    ],
  },
});
