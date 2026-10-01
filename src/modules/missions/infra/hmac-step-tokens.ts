import { createHmac, timingSafeEqual } from "node:crypto";
import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import { QR_MAX_TTL_SECONDS, type StepTokenSigner } from "../domain/step-validation";

// Formato: <stepId>.<expiração em segundos Unix>.<assinatura>
// Assinatura = HMAC-SHA256(segredo, "lalaia.step.v1|<stepId>|<exp>"), 16 bytes em base64url.
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/;
const SIGNATURE_BYTES = 16;

const invalid = () => err(new BusinessRuleError("qr_invalid", "Este QR code não é válido. Peça ao estabelecimento para mostrar o QR atual."));
const expired = () => err(new BusinessRuleError("qr_expired", "Este QR code expirou. Escaneie o QR que está no balcão agora."));

/** Tokens de QR assinados com HMAC. O segredo vem do ambiente (MISSIONS_QR_SECRET), nunca do código. */
export class HmacStepTokens implements StepTokenSigner {
  constructor(private readonly secret: string) {
    if (secret.length < 32) throw new Error("Segredo dos QR codes curto demais (mínimo 32 caracteres).");
  }

  sign(stepId: string, expiresAt: Date): string {
    const exp = Math.floor(expiresAt.getTime() / 1000);
    return `${stepId}.${exp}.${this.signature(stepId, exp).toString("base64url")}`;
  }

  verify(token: string, now: Date): Result<{ stepId: string; expiresAt: Date }, BusinessRuleError> {
    const match = TOKEN.exec(token);
    if (!match) return invalid();
    const [, stepId, expText, signature] = match;
    const exp = Number(expText);

    // Comparação em tempo constante: não vaza quantos bytes da assinatura estavam certos.
    const given = Buffer.from(signature, "base64url");
    const expected = this.signature(stepId, exp);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return invalid();

    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (exp <= nowSeconds) return expired();
    if (exp - nowSeconds > QR_MAX_TTL_SECONDS) return invalid();
    return ok({ stepId, expiresAt: new Date(exp * 1000) });
  }

  claimedStepId(token: string): string | null {
    return TOKEN.exec(token)?.[1] ?? null;
  }

  private signature(stepId: string, exp: number): Buffer {
    return createHmac("sha256", this.secret).update(`lalaia.step.v1|${stepId}|${exp}`).digest().subarray(0, SIGNATURE_BYTES);
  }
}
