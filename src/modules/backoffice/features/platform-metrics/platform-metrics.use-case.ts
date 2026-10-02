import { z } from "zod";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";

export const metricPeriods = [7, 30, 90] as const;
export type MetricPeriod = (typeof metricPeriods)[number];

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Período de /admin/metricas, a partir da URL. Valor inválido cai no padrão (30 dias). */
export const metricsFilterSchema = z.object({
  periodo: z.preprocess(first, z.coerce.number().refine((v): v is MetricPeriod => (metricPeriods as readonly number[]).includes(v)).catch(30)),
});

/** Contagem de um módulo, pela API pública dele. Só números: nenhum dado pessoal. */
export interface PlatformCounter {
  /** Quantos aconteceram em [from, to). */
  between(from: Date, to: Date): Promise<number>;
  /** Quantos existem hoje, quando faz sentido (ex.: usuários, parceiros ativos). */
  total?(): Promise<number>;
}

export const platformMetrics = [
  { id: "users", label: "Novos usuários", totalLabel: "usuários no total" },
  { id: "partners", label: "Parceiros aprovados", totalLabel: "parceiros ativos hoje" },
  { id: "events", label: "Eventos publicados", totalLabel: null },
  { id: "missions", label: "Missões concluídas", totalLabel: null },
  { id: "lives", label: "Lives transmitidas", totalLabel: null },
] as const;

export type PlatformMetricId = (typeof platformMetrics)[number]["id"];
export type PlatformCounters = Record<PlatformMetricId, PlatformCounter>;

export type PlatformMetricView = {
  id: PlatformMetricId;
  label: string;
  /** No período escolhido. */
  current: number;
  /** No período anterior, de mesma duração. */
  previous: number;
  /** Total de hoje e o que ele conta; null quando a métrica não tem total. */
  total: { value: number; label: string } | null;
};

export type PlatformMetricsView = { period: MetricPeriod; from: Date; to: Date; metrics: PlatformMetricView[] };

const DAY_MS = 86_400_000;

/** Backoffice (#145): números gerais da plataforma no período e a comparação com o período anterior. */
export class GetPlatformMetrics {
  constructor(
    private readonly counters: PlatformCounters,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(viewer: { isAdmin: boolean }, params: Record<string, unknown>): Promise<Result<PlatformMetricsView, DomainError>> {
    if (!viewer.isAdmin) return err(new ForbiddenError());
    const period = metricsFilterSchema.parse(params).periodo;
    const to = this.now();
    const from = new Date(to.getTime() - period * DAY_MS);
    const before = new Date(from.getTime() - period * DAY_MS);

    const metrics = await Promise.all(
      platformMetrics.map(async ({ id, label, totalLabel }): Promise<PlatformMetricView> => {
        const counter = this.counters[id];
        const [current, previous, total] = await Promise.all([counter.between(from, to), counter.between(before, from), totalLabel && counter.total ? counter.total() : null]);
        return { id, label, current, previous, total: total === null || !totalLabel ? null : { value: total, label: totalLabel } };
      }),
    );
    return ok({ period, from, to, metrics });
  }
}

/** Variação contra o período anterior, em texto ("+25%", "+3", "sem mudança"). Sem base anterior não há percentual. */
export function changeLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "sem mudança";
  const sign = diff > 0 ? "+" : "−";
  if (previous === 0) return `${sign}${Math.abs(diff).toLocaleString("pt-BR")}`;
  return `${sign}${Math.abs((diff / previous) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
