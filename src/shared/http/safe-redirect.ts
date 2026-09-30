/**
 * Aceita só caminhos internos relativos ("/mapa?x=1"). Bloqueia open redirect:
 * URLs absolutas, "//dominio", "/\dominio" e esquemas como "javascript:".
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "http://interno.invalid");
    return url.origin === "http://interno.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
