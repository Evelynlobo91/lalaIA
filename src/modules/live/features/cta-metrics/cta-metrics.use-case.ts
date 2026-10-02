import { z } from "zod";

/** Quantas vezes a chamada apareceu para alguém e quantas vezes tocaram no botão. Só contagens (LGPD). */
export type CtaMetrics = { impressions: number; clicks: number };

/** Totais vindos do Analytics (outro módulo): validados antes de chegar à tela. */
const totalsSchema = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative()));

/** Porta para as contagens do Analytics (implementada pela API pública dele). */
export interface CtaInteractionCounter {
  totals(entityType: "cta", entityIds: string[]): Promise<Record<string, Partial<Record<string, number>>>>;
}

/**
 * #182 — Impressões (`cta_impression`) e cliques (`cta_click`) de cada chamada, para o parceiro. Quem chama já
 * garantiu que os ids são do próprio parceiro (vêm do painel dele). Uma consulta agregada.
 */
export class GetCtaMetrics {
  constructor(private readonly counter: CtaInteractionCounter) {}

  async execute(ctaIds: string[]): Promise<Record<string, CtaMetrics>> {
    if (ctaIds.length === 0) return {};
    const totals = totalsSchema.parse(await this.counter.totals("cta", ctaIds));
    return Object.fromEntries(ctaIds.map((id) => [id, { impressions: totals[id]?.cta_impression ?? 0, clicks: totals[id]?.cta_click ?? 0 }]));
  }
}
