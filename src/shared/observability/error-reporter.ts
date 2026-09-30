import * as Sentry from "@sentry/nextjs";
import { currentRequestContext } from "./request-context";

export type ErrorContext = { module?: string; [key: string]: unknown };

/** Porta para envio de erros a um serviço de monitoramento (RNF10). */
export interface ErrorReporter {
  capture(error: unknown, context?: ErrorContext): void;
}

/** Implementação Sentry. Sem DSN configurado o SDK não é inicializado e nada é enviado. */
export const sentryErrorReporter: ErrorReporter = {
  capture(error, context = {}) {
    const { module, ...extra } = context;
    Sentry.withScope((scope) => {
      const requestId = currentRequestContext()?.requestId;
      if (requestId) scope.setTag("request_id", requestId);
      if (module) scope.setTag("module", module);
      scope.setExtras(extra);
      Sentry.captureException(error);
    });
  },
};

const globalForReporter = globalThis as unknown as { errorReporter?: ErrorReporter };

export function errorReporter(): ErrorReporter {
  return globalForReporter.errorReporter ?? sentryErrorReporter;
}

/** Permite trocar a implementação (ex.: testes). */
export function setErrorReporter(reporter: ErrorReporter | undefined): void {
  globalForReporter.errorReporter = reporter;
}
