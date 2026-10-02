import { errorReporter } from "../observability/error-reporter";
import { logger } from "../observability/logger";
import type { DomainEventBus } from "./domain-event";
import { InMemoryEventBus } from "./in-memory-event-bus";

export type {
  DomainEvent,
  DomainEventBus,
  DomainEventMap,
  DomainEventPublisher,
  DomainEventSubscriber,
  EventHandler,
} from "./domain-event";
export { InMemoryEventBus } from "./in-memory-event-bus";
export type { ModuleSubscriptions } from "./module-subscriptions";

// Instância única por processo, compartilhada entre os bundles do Next (instrumentation e rotas).
const globalForEvents = globalThis as unknown as { domainEvents?: DomainEventBus };

export function domainEvents(): DomainEventBus {
  globalForEvents.domainEvents ??= new InMemoryEventBus({
    onHandlerError: (error, event) => {
      const context = { eventType: String(event.type), eventId: event.id };
      logger().error("falha em assinante de evento", { ...context, err: error });
      errorReporter().capture(error, context);
    },
  });
  return globalForEvents.domainEvents;
}
