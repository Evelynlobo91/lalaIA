// Validação de etapa como estratégia (OCP, epic #9): cada tipo de validação é um `StepValidator`.
// Um tipo novo (ex.: GPS/geofence) entra como nova prova + nova estratégia, sem mudar `CompleteStep`.
import type { BusinessRuleError, Result } from "@/shared/kernel";
import { fromLocalInput, toLocalInput } from "@/shared/time/joinville-time";
import type { MissionStep, ValidationKind } from "./mission";

/** Prova apresentada pelo usuário para concluir uma etapa. */
export type StepProof = { kind: "qr"; token: string };

export type ValidationContext = { userId: string; now: Date };

export interface StepValidator {
  readonly kind: ValidationKind;
  validate(step: MissionStep, proof: StepProof, context: ValidationContext): Promise<Result<void, BusinessRuleError>> | Result<void, BusinessRuleError>;
}

/** Token assinado do QR de uma etapa (o segredo fica no adaptador, fora do domínio). */
export interface StepTokenSigner {
  sign(stepId: string, expiresAt: Date): string;
  /** Confere formato, assinatura e validade. Nunca confie no conteúdo antes disso. */
  verify(token: string, now: Date): Result<{ stepId: string; expiresAt: Date }, BusinessRuleError>;
  /** Etapa que o token DIZ ser (sem verificar): só para escolher a etapa; quem decide é `verify`. */
  claimedStepId(token: string): string | null;
}

/** Política de validade do QR: na tela gira a cada minuto; o impresso vale até o fim do dia. */
export const QR_ROTATION_SECONDS = 60;
export const QR_SCREEN_TTL_SECONDS = 5 * 60;
/** Nenhum token vale mais do que isso, mesmo bem assinado (limita o estrago de um vazamento). */
export const QR_MAX_TTL_SECONDS = 26 * 60 * 60;

/**
 * Expiração do QR da tela: alinhada ao minuto, então todos que abrem a página no mesmo minuto
 * veem o mesmo QR, e ele troca sozinho (rotativo). Vale de 4 a 5 minutos.
 */
export function screenTokenExpiry(now: Date): Date {
  const rotation = QR_ROTATION_SECONDS * 1000;
  return new Date(Math.ceil(now.getTime() / rotation) * rotation + (QR_SCREEN_TTL_SECONDS - QR_ROTATION_SECONDS) * 1000);
}

/** Expiração do QR impresso: 23:59:59 de hoje no horário de Joinville (imprime-se um por dia). */
export function printTokenExpiry(now: Date): Date {
  const endOfDay = fromLocalInput(`${toLocalInput(now).slice(0, 10)}T23:59`);
  return new Date((endOfDay ?? now).getTime() + 59_000);
}
