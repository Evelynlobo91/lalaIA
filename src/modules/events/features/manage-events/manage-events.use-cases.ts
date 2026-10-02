import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { EventDraft, EventPlaceLookup, EventRecord, EventRepository } from "../../domain/event";
import "../../domain/events";

/** Quem age: o id vem da sessão; `isPartner`/`isAdmin` conferidos aqui também (não só na action). */
export type Organizer = { id: string; isPartner: boolean; isAdmin: boolean };

// Tolerância para relógio do celular levemente atrasado ao criar "agora".
const PAST_TOLERANCE_MS = 5 * 60 * 1000;

/** RF13 — Criar ou editar evento (parceiro dono, ou admin). */
export class SaveEvent {
  constructor(
    private readonly events: EventRepository,
    private readonly places: EventPlaceLookup,
    private readonly bus: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(organizer: Organizer, eventId: string | undefined, draft: EventDraft): Promise<Result<EventRecord, DomainError>> {
    if (!organizer.isPartner && !organizer.isAdmin) return err(new ForbiddenError("Só parceiros publicam eventos."));
    if (!(await this.places.summary(draft.placeId))) return err(new ValidationError("Lugar não encontrado.", [{ path: ["placeId"], message: "Escolha um lugar da lista." }]));

    if (!eventId) {
      if (draft.startsAt.getTime() < this.now().getTime() - PAST_TOLERANCE_MS) {
        return err(new ValidationError("Data no passado.", [{ path: ["startsAt"], message: "O início não pode estar no passado." }]));
      }
      const created = await this.events.create(organizer.id, draft);
      await this.bus.publish("events.EventPublished", { eventId: created.id, placeId: created.placeId, ownerId: created.ownerId });
      return ok(created);
    }

    const current = await this.events.findById(eventId);
    if (!current) return err(new NotFoundError("Evento"));
    if (current.ownerId !== organizer.id && !organizer.isAdmin) return err(new ForbiddenError("Só quem publicou pode editar este evento."));
    if (current.status === "cancelled") return err(new BusinessRuleError("event_cancelled", "Evento cancelado não pode ser editado."));
    if (current.endsAt < this.now()) return err(new BusinessRuleError("event_finished", "Evento que já terminou não pode ser editado."));

    const updated = await this.events.update(organizer.id, eventId, draft);
    if (!updated) return err(new ForbiddenError("Só quem publicou pode editar este evento."));
    if (current.ownerId !== organizer.id) await this.bus.publish("events.EventEditedByAdmin", { eventId, editedBy: organizer.id });
    return ok(updated);
  }
}

/** Cancelar mantém o evento visível como "cancelado" (quem já tinha visto fica sabendo). */
export class CancelEvent {
  constructor(
    private readonly events: EventRepository,
    private readonly bus: DomainEventPublisher,
  ) {}

  async execute(organizer: Organizer, eventId: string): Promise<Result<EventRecord, DomainError>> {
    const current = await this.events.findById(eventId);
    if (!current) return err(new NotFoundError("Evento"));
    if (current.ownerId !== organizer.id && !organizer.isAdmin) return err(new ForbiddenError("Só quem publicou pode cancelar este evento."));
    if (current.status === "cancelled") return ok(current);

    const cancelled = await this.events.cancel(organizer.id, eventId);
    if (!cancelled) return err(new ForbiddenError("Só quem publicou pode cancelar este evento."));
    await this.bus.publish("events.EventCancelled", { eventId });
    if (current.ownerId !== organizer.id) await this.bus.publish("events.EventCancelledByAdmin", { eventId, cancelledBy: organizer.id });
    return ok(cancelled);
  }
}
