// Minimização de dados pessoais nos logs (RNF11/LGPD): chaves sensíveis nunca saem em claro.
const SENSITIVE_KEY = /pass|senha|token|secret|authorization|cookie|api[-_]?key|email|cpf|phone|telefone|stream[-_]?key/i;
const MAX_DEPTH = 6;

export const REDACTED = "[redacted]";

export function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...("code" in error ? { code: error.code } : {}),
    ...(error.cause ? { cause: error.cause instanceof Error ? serializeError(error.cause) : String(error.cause) } : {}),
  };
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1, seen);
  }
  return out;
}
