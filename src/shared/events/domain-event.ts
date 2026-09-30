/**
 * Catálogo de eventos de domínio. Cada módulo declara os seus por declaration merging,
 * no próprio `domain/events.ts`, com o nome no formato `<modulo>.<Evento>`:
 *
 *   declare module "@/shared/events/domain-event" {
 *     interface DomainEventMap {
 *       "missions.StepCompleted": { userId: string; missionId: string; stepId: string };
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- preenchida pelos módulos
export interface DomainEventMap {}

export type EventMap = object;

export type DomainEvent<M extends EventMap = DomainEventMap, K extends keyof M = keyof M> = {
  readonly id: string;
  readonly type: K;
  readonly occurredAt: Date;
  readonly payload: M[K];
};

export type EventHandler<M extends EventMap, K extends keyof M> = (event: DomainEvent<M, K>) => Promise<void> | void;

/** Porta usada por casos de uso: só publicam (ISP). */
export interface DomainEventPublisher<M extends EventMap = DomainEventMap> {
  publish<K extends keyof M>(type: K, payload: M[K]): Promise<void>;
}

/** Porta usada na composição dos módulos: só assinam. */
export interface DomainEventSubscriber<M extends EventMap = DomainEventMap> {
  subscribe<K extends keyof M>(type: K, handler: EventHandler<M, K>): () => void;
}

export type DomainEventBus<M extends EventMap = DomainEventMap> = DomainEventPublisher<M> & DomainEventSubscriber<M>;
