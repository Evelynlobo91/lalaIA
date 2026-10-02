// Roda uma vez quando o servidor Next.js sobe, antes de atender requisições.
// A composição fica em src/bootstrap/ (verificada pelo lint de fronteiras).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerSubscriptions } = await import("./bootstrap/register-subscriptions");
  await registerSubscriptions();
}
