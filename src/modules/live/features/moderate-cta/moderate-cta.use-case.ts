import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { CtaRecord } from "../../domain/cta";
import type { StreamEntityType } from "../../domain/stream";

export const MODERATION_LIMIT = 50;

export const moderateCtaSchema = z.object({ ctaId: z.uuid(), intent: z.enum(["disable", "enable"]) });

/** Quem modera: o id vem da sessão; a capacidade (`content:edit`) é conferida aqui e de novo na RLS. */
export type CtaModerator = { id: string; canModerate: boolean };

/** Chamada na lista da moderação, com a página pública onde a live aparece. */
export type CtaForModeration = Pick<CtaRecord, "id" | "type" | "title" | "body" | "buttonLabel" | "href" | "external" | "disabledAt" | "createdAt"> & {
  entityType: StreamEntityType;
  entityId: string;
};

export interface CtaModerationStore {
  /** Chamadas de todos os parceiros, das mais recentes para as mais antigas (RLS: só a moderação lê). */
  listAll(actorId: string, limit: number): Promise<CtaForModeration[]>;
  /** Desativa ou reativa como o usuário (RLS: só a moderação). null se a chamada não existe. */
  setDisabled(actorId: string, ctaId: string, disabled: boolean): Promise<CtaRecord | null>;
}

/** #182 — A moderação vê as chamadas de toda a plataforma. */
export class ListCtasForModeration {
  constructor(private readonly ctas: Pick<CtaModerationStore, "listAll">) {}

  async execute(moderator: CtaModerator): Promise<Result<CtaForModeration[], DomainError>> {
    if (!moderator.canModerate) return err(new ForbiddenError());
    return ok(await this.ctas.listAll(moderator.id, MODERATION_LIMIT));
  }
}

/**
 * #182 — A moderação desativa (ou reativa) uma chamada: desativada, ela não aparece no player. O parceiro vê o
 * motivo no portal e não consegue reativar sozinho. A ação vai para a trilha de auditoria (evento de domínio).
 */
export class ModerateCta {
  constructor(
    private readonly ctas: Pick<CtaModerationStore, "setDisabled">,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(moderator: CtaModerator, ctaId: string, intent: "disable" | "enable"): Promise<Result<CtaRecord, DomainError>> {
    if (!moderator.canModerate) return err(new ForbiddenError());
    const updated = await this.ctas.setDisabled(moderator.id, ctaId, intent === "disable");
    if (!updated) return err(new NotFoundError("Chamada"));
    if (intent === "disable") await this.events.publish("live.CtaDisabledByAdmin", { ctaId, streamId: updated.streamId, disabledBy: moderator.id });
    else await this.events.publish("live.CtaEnabledByAdmin", { ctaId, streamId: updated.streamId, enabledBy: moderator.id });
    return ok(updated);
  }
}
