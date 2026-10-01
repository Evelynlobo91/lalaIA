import { createHmac, timingSafeEqual } from "node:crypto";

// Formato de assinatura do Mux (o adaptador fake usa o mesmo, com outro segredo):
//   mux-signature: t=<segundos Unix>,v1=<hex do HMAC-SHA256(segredo, "<t>.<corpo cru>")>
export const SIGNATURE_HEADER = "mux-signature";
/** Tolerância entre o carimbo da assinatura e o relógio do servidor (anti-replay). */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

function hmacHex(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Gera o valor do header (testes, E2E e o simulador do adaptador fake). */
export function signWebhook(secret: string, rawBody: string, now: Date = new Date()): string {
  const t = String(Math.floor(now.getTime() / 1000));
  return `t=${t},v1=${hmacHex(secret, t, rawBody)}`;
}

/**
 * Confere a assinatura em tempo constante e a janela de tempo. Aceita mais de um `v1`
 * (o provedor pode mandar duas assinaturas durante a troca de segredo).
 */
export function verifyWebhookSignature(secret: string, rawBody: string, header: string | null, now: Date = new Date()): boolean {
  if (!header || header.length > 1000) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3).toLowerCase());
  if (!t || !/^\d{1,12}$/.test(t) || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(t));
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(hmacHex(secret, t, rawBody), "hex");
  // Compara todas (sem retorno antecipado) para não vazar qual delas bateu.
  let valid = false;
  for (const signature of signatures) {
    if (!HEX_SHA256.test(signature)) continue;
    if (timingSafeEqual(Buffer.from(signature, "hex"), expected)) valid = true;
  }
  return valid;
}
