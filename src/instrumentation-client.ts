// Roda no navegador antes do app ficar interativo: monitoramento de erros do front (RNF10).
// Sem replay de sessão: gravaria telas com dados pessoais (LGPD).
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./shared/observability/sentry-options";

Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
