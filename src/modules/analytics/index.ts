// API pública do módulo analytics (interações e, depois, o painel do promotor).
import type { ModuleSubscriptions } from "@/shared/events";
import { trackInteraction } from "./composition";
import { trackRoute } from "./features/tracking/tracking.route";
import { domainInteractions, type TrackedDomainEvent } from "./features/tracking/tracking.use-case";

export { TrackView } from "./features/tracking/ui/track-view";

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
