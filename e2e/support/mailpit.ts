// Leitura dos e-mails capturados pelo Mailpit do Supabase local (npm run db:start).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MessageSummary = { ID: string; To: Array<{ Address: string }>; Subject: string };

export async function waitForEmail(to: string, timeoutMs = 20_000): Promise<{ subject: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: MessageSummary[] };
    if (messages.length > 0) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      return { subject: message.Subject, html: message.HTML };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum e-mail para ${to} em ${timeoutMs}ms`);
}

export async function countEmails(to: string): Promise<number> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: MessageSummary[] }).messages.length;
}

export function firstLink(html: string): string {
  const match = html.match(/href="([^"]+)"/);
  if (!match) throw new Error("E-mail sem link");
  return match[1].replaceAll("&amp;", "&");
}
