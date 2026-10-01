import { ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { localDate } from "@/shared/time/joinville-time";
import type { DailyMetric, DailyMetricsReader } from "../../domain/daily-metrics";
import { dailyMetricsSchema, type DailyMetricsInput } from "./aggregations.schema";

/**
 * #77 — Métricas diárias por entidade e período (dias de Joinville). Dias fechados vêm da materialized
 * view (rápida); o dia de hoje, direto das interações (sempre atual).
 */
export class GetDailyMetrics {
  constructor(
    private readonly reader: DailyMetricsReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: DailyMetricsInput): Promise<Result<DailyMetric[], DomainError>> {
    const parsed = dailyMetricsSchema.safeParse(input);
    if (!parsed.success) return err(new ValidationError("Consulta de métricas inválida.", parsed.error.issues));
    const { refs, from, to } = parsed.data;
    if (!Object.values(refs).some((list) => list && list.length > 0)) return ok([]);
    return ok(await this.reader.daily({ refs, from, to, today: localDate(this.clock()) }));
  }
}
