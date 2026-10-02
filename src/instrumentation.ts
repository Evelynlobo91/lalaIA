import * as Sentry from "@sentry/nextjs";

// Roda uma vez quando o servidor Next.js sobe, antes de atender requisições.
// A composição fica em src/bootstrap/ (verificada pelo lint de fronteiras).
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./bootstrap/sentry.edge");
    return;
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await import("./bootstrap/sentry.server");
  const { registerSubscriptions } = await import("./bootstrap/register-subscriptions");
  await registerSubscriptions();
}

// Erros de renderização, rotas e server actions capturados pelo Next vão para o Sentry.
export const onRequestError = Sentry.captureRequestError;
