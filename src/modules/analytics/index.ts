// API pública do módulo analytics (interações e, depois, o painel do promotor).
import type { ModuleSubscriptions } from "@/shared/events";
import { interactionTotalsUseCase, trackInteraction } from "./composition";
import type { InteractionTotals } from "./features/interaction-totals/interaction-totals";
import type { InteractionEntityType } from "./domain/interaction";
import { trackRoute } from "./features/tracking/tracking.route";
import { domainInteractions, type TrackedDomainEvent } from "./features/tracking/tracking.use-case";

export { TrackView } from "./features/tracking/ui/track-view";
export type { InteractionTotals } from "./features/interaction-totals/interaction-totals";
export type { InteractionEntityType, InteractionKind } from "./domain/interaction";

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
