import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_HEADERS = ["authorization", "cookie", "set-cookie", "x-api-key"];

/** Remove dados pessoais e credenciais antes do envio (RNF11/LGPD). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) delete event.request.headers[header];
      }
    }
  }
  // Só o id do usuário, nunca e-mail, nome ou IP.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

/** Opções comuns a servidor, edge e navegador. Sem DSN, o SDK fica desligado. */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  };
}
