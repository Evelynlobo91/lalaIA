import { z } from "zod";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { leadSources, leadStages, type CrmActor, type LeadFilter, type LeadSource, type LeadStage } from "../../domain/lead";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(values: readonly T[]) =>
  z.preprocess(
    first,
    z
      .string()
      .refine((v): v is T => (values as readonly string[]).includes(v))
      .optional()
      .catch(undefined),
  );

/** Filtros de /admin/leads e do funil, a partir da URL (#151). Valor inválido ou vazio = sem filtro. */
export const leadFilterSchema = z
  .object({
    etapa: oneOf(leadStages.map((s) => s.id)),
    origem: oneOf(leadSources.map((s) => s.id)),
    responsavel: z.preprocess(first, z.uuid().optional().catch(undefined)),
  })
  .transform((v): LeadFilter => ({ stage: v.etapa as LeadStage | undefined, source: v.origem as LeadSource | undefined, ownerId: v.responsavel }));

/** Filtro → parâmetros da URL (só os preenchidos), para manter o filtro ao trocar de tela. */
export function leadFilterQuery(filter: LeadFilter): string {
  const query = new URLSearchParams();
  if (filter.stage) query.set("etapa", filter.stage);
  if (filter.source) query.set("origem", filter.source);
  if (filter.ownerId) query.set("responsavel", filter.ownerId);
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const conversionPeriods = [30, 90, 365] as const;
export type ConversionPeriod = (typeof conversionPeriods)[number] | "todos";

/** Período do relatório: leads cadastrados nos últimos N dias, ou todos. Valor inválido = todos. */
export const conversionPeriodSchema = z.object({
  // 0 = todo o período.
  periodo: z.preprocess(first, z.coerce.number().refine((v) => (conversionPeriods as readonly number[]).includes(v)).catch(0)),
});

export type SourceCount = { source: LeadSource; total: number; active: number; lost: number };

export interface LeadReports {
  /** Leads por origem (total, ativos e perdidos), cadastrados desde `since` (null = desde sempre). */
  countsBySource(actorId: string, since: Date | null): Promise<SourceCount[]>;
}

export type ConversionRow = { source: LeadSource | "total"; label: string; total: number; active: number; lost: number; open: number; /** Parceiros ativos ÷ leads, em %; null sem leads. */ rate: number | null };
export type ConversionView = { period: ConversionPeriod; rows: ConversionRow[] };

const DAY_MS = 86_400_000;
const rate = (active: number, total: number) => (total === 0 ? null : Math.round((active / total) * 1000) / 10);

/** Taxa de conversão por origem (#151): parceiros ativos ÷ leads da origem, no período. */
export class GetConversionBySource {
  constructor(
    private readonly reports: LeadReports,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: CrmActor, params: Record<string, unknown>): Promise<Result<ConversionView, DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const days = conversionPeriodSchema.parse(params).periodo;
    const since = days ? new Date(this.now().getTime() - days * DAY_MS) : null;
    const counts = new Map((await this.reports.countsBySource(actor.id, since)).map((c) => [c.source, c]));

    // Todas as origens aparecem, mesmo sem leads, na ordem do catálogo.
    const rows: ConversionRow[] = leadSources.map(({ id, label }) => {
      const c = counts.get(id) ?? { total: 0, active: 0, lost: 0 };
      return { source: id, label, total: c.total, active: c.active, lost: c.lost, open: c.total - c.active - c.lost, rate: rate(c.active, c.total) };
    });
    const sum = (key: "total" | "active" | "lost" | "open") => rows.reduce((acc, row) => acc + row[key], 0);
    rows.push({ source: "total", label: "Todas as origens", total: sum("total"), active: sum("active"), lost: sum("lost"), open: sum("open"), rate: rate(sum("active"), sum("total")) });

    return ok({ period: days ? (days as (typeof conversionPeriods)[number]) : "todos", rows });
  }
}
