import { z } from "zod";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { EventStatus } from "../../domain/event";

export const ADMIN_EVENTS_LIMIT = 50;

export const adminEventsSchema = z.object({ q: z.string().trim().max(80).catch("") });

/** Linha da lista do backoffice: todos os eventos, inclusive passados, cancelados e de parceiro suspenso. */
export type AdminEventItem = { id: string; title: string; status: EventStatus; startsAt: Date; endsAt: Date; ownerId: string; placeId: string };

export interface EventAdminReader {
  /** Eventos cujo título contém o texto (vazio = todos), do mais recente para o mais antigo. */
  searchAll(text: string, limit: number): Promise<AdminEventItem[]>;
}

/** Backoffice (#142): admin lista e busca qualquer evento. O papel é conferido aqui também. */
export class ListEventsForAdmin {
  constructor(private readonly events: EventAdminReader) {}

  async execute(viewer: { isAdmin: boolean }, text: string): Promise<Result<AdminEventItem[], DomainError>> {
    if (!viewer.isAdmin) return err(new ForbiddenError());
    return ok(await this.events.searchAll(adminEventsSchema.parse({ q: text }).q, ADMIN_EVENTS_LIMIT));
  }
}
