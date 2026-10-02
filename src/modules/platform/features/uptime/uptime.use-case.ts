import type { CheckResult, HealthCheck, HealthReport, OverallStatus } from "../../domain/health";

/** Tempo máximo de cada verificação: acima disso conta como falha (o monitor externo espera ~10 s). */
export const CHECK_TIMEOUT_MS = 3000;

type Logger = { warn(message: string, fields?: Record<string, unknown>): void };

/**
 * #81 — Verifica as dependências em paralelo, cada uma com tempo limite. Crítica falhou → "down";
 * só não críticas falharam → "degraded". O motivo da falha vai para o log, nunca para a resposta.
 */
export class CheckHealth {
  constructor(
    private readonly checks: readonly HealthCheck[],
    private readonly log: Logger,
    private readonly version: string,
    private readonly clock: () => number = () => performance.now(),
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = CHECK_TIMEOUT_MS,
  ) {}

  async execute(): Promise<HealthReport> {
    const checks = await Promise.all(this.checks.map((c) => this.runOne(c)));
    const status: OverallStatus = checks.some((c) => c.critical && c.status === "fail")
      ? "down"
      : checks.some((c) => c.status === "fail")
        ? "degraded"
        : "ok";
    return { status, checkedAt: this.now().toISOString(), version: this.version, checks };
  }

  private async runOne(check: HealthCheck): Promise<CheckResult> {
    const started = this.clock();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Rejeita antes de abortar: o motivo registrado é o tempo, não o cancelamento.
        reject(new Error(`tempo esgotado (${this.timeoutMs} ms)`));
        controller.abort();
      }, this.timeoutMs);
    });
    try {
      await Promise.race([check.run(controller.signal), timeout]);
      return { name: check.name, critical: check.critical, status: "ok", latencyMs: Math.round(this.clock() - started) };
    } catch (error) {
      this.log.warn("verificação de saúde falhou", { check: check.name, error: error instanceof Error ? error.message : String(error) });
      return { name: check.name, critical: check.critical, status: "fail", latencyMs: Math.round(this.clock() - started) };
    } finally {
      clearTimeout(timer);
    }
  }
}
