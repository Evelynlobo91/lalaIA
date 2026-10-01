/** Saúde da aplicação (RNF08): cada dependência é uma verificação independente (OCP). */
export type CheckStatus = "ok" | "fail";
export type OverallStatus = "ok" | "degraded" | "down";

/**
 * Uma dependência a verificar. `critical`: sem ela o app não funciona (ex.: banco) → "down";
 * as demais derrubam só para "degraded" (ex.: login fora do ar, mas o resto navega).
 */
export interface HealthCheck {
  readonly name: string;
  readonly critical: boolean;
  /** Resolve se está saudável; rejeita (ou estoura o tempo) se não. */
  run(signal: AbortSignal): Promise<void>;
}

export type CheckResult = { name: string; critical: boolean; status: CheckStatus; latencyMs: number };

export type HealthReport = { status: OverallStatus; checkedAt: string; version: string; checks: CheckResult[] };
