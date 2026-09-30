import type { DomainEvent, DomainEventBus, DomainEventMap, EventHandler, EventMap } from "./domain-event";

/** Evento sem o tipo do catálogo, usado internamente e no reporte de falhas. */
export type AnyDomainEvent = { readonly id: string; readonly type: PropertyKey; readonly occurredAt: Date; readonly payload: unknown };

type AnyHandler = (event: AnyDomainEvent) => Promise<void> | void;

export type HandlerErrorReporter = (error: unknown, event: AnyDomainEvent) => void;

type Options = {
  onHandlerError?: HandlerErrorReporter;
  now?: () => Date;
  newId?: () => string;
};

/**
 * Event bus in-process. Handlers rodam em paralelo e são isolados: a falha de um
 * assinante (ex.: analytics) é reportada, mas não afeta quem publicou nem os outros.
 * Handlers devem ser idempotentes (usar `event.id` para deduplicar).
 */
export class InMemoryEventBus<M extends EventMap = DomainEventMap> implements DomainEventBus<M> {
  private readonly handlers = new Map<keyof M, Set<AnyHandler>>();
  private readonly onHandlerError: HandlerErrorReporter;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(options: Options = {}) {
    this.onHandlerError = options.onHandlerError ?? ((error, event) => console.error(`Falha ao tratar ${String(event.type)}`, error));
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  subscribe<K extends keyof M>(type: K, handler: EventHandler<M, K>): () => void {
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as AnyHandler);
  }

  async publish<K extends keyof M>(type: K, payload: M[K]): Promise<void> {
    const event: DomainEvent<M, K> = { id: this.newId(), type, occurredAt: this.now(), payload };
    const handlers = [...(this.handlers.get(type) ?? [])];
    const results = await Promise.allSettled(handlers.map(async (handle) => handle(event)));
    for (const result of results) {
      if (result.status === "rejected") this.onHandlerError(result.reason, event);
    }
  }
}
