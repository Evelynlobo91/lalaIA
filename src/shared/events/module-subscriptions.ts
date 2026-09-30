import type { DomainEventSubscriber } from "./domain-event";

/**
 * Contrato que um módulo exporta no seu `index.ts` quando reage a eventos de outros módulos:
 *
 *   export const subscriptions: ModuleSubscriptions = (bus) => {
 *     bus.subscribe("missions.StepCompleted", (e) => grantXp().execute(e.payload));
 *   };
 *
 * O registro acontece uma única vez, no boot do servidor (src/instrumentation.ts).
 */
export type ModuleSubscriptions = (bus: DomainEventSubscriber) => void;
