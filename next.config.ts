import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto (evita que um package-lock.json em pasta acima seja tomado como raiz).
  turbopack: { root: __dirname },
  // No canto inferior o indicador de dev cobre a barra de navegação do celular.
  devIndicators: { position: "top-right" },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  // Upload de source maps só quando houver token (CI/produção).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
