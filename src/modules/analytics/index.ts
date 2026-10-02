// API pública do módulo analytics (interações e, depois, o painel do promotor).
import type { ModuleSubscriptions } from "@/shared/events";
import { NotFoundError } from "@/shared/kernel";
import { dailyMetrics, interactionTotalsUseCase, trackInteraction } from "./composition";
import type { DailyMetric } from "./domain/daily-metrics";
import type { DailyMetricsInput } from "./features/aggregations/aggregations.schema";
import { partnerDashboardRoute } from "./features/partner-dashboard/partner-dashboard.route";
import { partnerDashboardSchema } from "./features/partner-dashboard/partner-dashboard.schema";
import { PartnerDashboard, type PartnerResources } from "./features/partner-dashboard/partner-dashboard.use-case";
import type { InteractionTotals } from "./features/interaction-totals/interaction-totals";
import type { InteractionEntityType } from "./domain/interaction";
import { trackRoute } from "./features/tracking/tracking.route";
import { domainInteractions, type TrackedDomainEvent } from "./features/tracking/tracking.use-case";

export { TrackView } from "./features/tracking/ui/track-view";
export type { InteractionTotals } from "./features/interaction-totals/interaction-totals";
export type { InteractionEntityType, InteractionKind } from "./domain/interaction";
export type { DailyMetric, EntityRefs } from "./domain/daily-metrics";
export type { PartnerResource, PartnerResources, PartnerDashboardView, MetricView, MetricId } from "./features/partner-dashboard/partner-dashboard.use-case";
export { PartnerDashboardPanel } from "./features/partner-dashboard/ui/partner-dashboard-panel";

/** #77 — Métricas diárias por entidade e período (dias de Joinville). Entrada inválida → ValidationError. */
export async function dailyMetricsOf(input: DailyMetricsInput): Promise<DailyMetric[]> {
  const result = await dailyMetrics().execute(input);
  if (!result.ok) throw result.error;
  return result.value;
}

/**
 * #78 — Painel do promotor a partir da URL. `resources` (porta) vem da composição da aplicação e devolve só
 * os recursos do próprio parceiro. Filtro inválido → `invalid` e os padrões; recurso alheio → `notFound`.
 */
export async function partnerDashboard(userId: string, params: Record<string, string | string[] | undefined>, resources: PartnerResources) {
  const single = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);
  const parsed = partnerDashboardSchema.safeParse({ periodo: single(params.periodo), recurso: single(params.recurso) });
  const result = await new PartnerDashboard(resources, dailyMetrics()).execute(userId, parsed.success ? parsed.data : partnerDashboardSchema.parse({}));
  if (!result.ok) {
    if (result.error instanceof NotFoundError) return { notFound: true as const };
    throw result.error;
  }
  return { notFound: false as const, invalid: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Filtro inválido."), view: result.value };
}

/**
 * Totais de interações por entidade e tipo (ex.: `live_view` das transmissões, `view` das páginas), desde
 * `since` ou desde sempre. Uma consulta agregada pelo índice por entidade; só contagens, nunca quem fez (LGPD).
 * Entrada inválida (tipo, ids, mais de 200 ids) → ValidationError.
 */
export async function interactionTotals(entityType: InteractionEntityType, entityIds: string[], since?: Date): Promise<InteractionTotals> {
  const result = await interactionTotalsUseCase().execute({ entityType, entityIds, since });
  if (!result.ok) throw result.error;
  return result.value;
}

export const analyticsApi = {
  /** POST /api/analytics/track — visualizações enviadas pela tela. */
  track: trackRoute,
  /** GET /api/partner/dashboard — painel do promotor (só parceiros, só os próprios recursos). */
  partnerDashboard: (resources: PartnerResources) => partnerDashboardRoute(() => new PartnerDashboard(resources, dailyMetrics())),
};

/**
 * Os módulos não chamam o Analytics: ele assina os eventos de domínio deles (registrado no boot).
 * A gravação é agendada para depois da resposta, então o assinante retorna na hora.
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  for (const type of Object.keys(domainInteractions) as TrackedDomainEvent[]) {
    bus.subscribe(type, (event) => trackInteraction().fromDomain(event));
  }
};
