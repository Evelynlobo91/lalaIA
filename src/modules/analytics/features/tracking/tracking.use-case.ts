import type { DomainEvent, DomainEventMap } from "@/shared/events";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { BackgroundRunner, Interaction, InteractionEntityType, InteractionKind, InteractionStore } from "../../domain/interaction";
import type { TrackUiInput } from "./tracking.schema";

type Target = { kind: InteractionKind; entityType: InteractionEntityType; entityId: string };

/**
 * Como cada evento de domínio vira interação. Novo evento rastreado = nova linha aqui (OCP);
 * os módulos de origem não sabem que o Analytics existe.
 */
export const domainInteractions = {
  "favorites.FavoriteAdded": (p) => ({ kind: "favorite", entityType: p.entityType, entityId: p.entityId }),
  "favorites.WantToGoClicked": (p) => ({ kind: "quero_ir", entityType: p.entityType, entityId: p.entityId }),
  "missions.StepCompleted": (p) => ({ kind: "checkin", entityType: "mission", entityId: p.missionId }),
} satisfies { [K in keyof DomainEventMap]?: (payload: DomainEventMap[K]) => Target };

export type TrackedDomainEvent = keyof typeof domainInteractions;

/**
 * RF25 — Registro uniforme de interações. A gravação é agendada para depois da resposta
 * (`BackgroundRunner`), então quem chama nunca espera o banco nem falha por causa do Analytics.
 */
export class TrackInteraction {
  constructor(
    private readonly store: InteractionStore,
    private readonly background: BackgroundRunner,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Visualização enviada pela tela. Responde na hora; a escrita fica para depois. */
  fromUi(input: TrackUiInput): Result<{ accepted: true }, DomainError> {
    const interaction: Interaction = { ...input, source: "ui", occurredAt: this.clock() };
    this.background.run(() => this.store.record(interaction));
    return ok({ accepted: true });
  }

  /** Evento de domínio assinado (idempotente pelo id do evento). */
  fromDomain<K extends TrackedDomainEvent>(event: DomainEvent<DomainEventMap, K>): void {
    const target = (domainInteractions[event.type] as (payload: DomainEventMap[K]) => Target)(event.payload);
    const interaction: Interaction = { ...target, source: "domain", eventId: event.id, occurredAt: event.occurredAt };
    this.background.run(() => this.store.record(interaction));
  }
}
