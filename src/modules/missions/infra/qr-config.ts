import "server-only";
import { z } from "zod";

// Segredo para assinar os QR codes das etapas (HMAC). Só no servidor; sem valor padrão no código.
// Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
const schema = z.object({
  MISSIONS_QR_SECRET: z.string().min(32, "MISSIONS_QR_SECRET precisa ter pelo menos 32 caracteres"),
});

let cached: string | undefined;

export function missionsQrSecret(): string {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) throw new Error("MISSIONS_QR_SECRET ausente ou curto demais (mínimo 32 caracteres). Veja .env.example.");
    cached = parsed.data.MISSIONS_QR_SECRET;
  }
  return cached;
}
