import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { StreamEntityType } from "../../domain/stream";

export const REPORT_REASONS = ["ofensa", "assedio", "spam", "outro"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = { ofensa: "Ofensa ou palavrão", assedio: "Assédio ou ameaça", spam: "Spam ou golpe", outro: "Outro motivo" };

export const REPORTS_LIMIT = 50;

export const reportMessageSchema = z.object({ messageId: z.uuid(), reason: z.enum(REPORT_REASONS, { error: "Escolha o motivo." }) });
export const resolveReportSchema = z.object({ messageId: z.uuid(), intent: z.enum(["remove", "keep"]) });

/** Mensagem denunciada na fila da moderação: o texto, quem escreveu (nome) e por que foi denunciada. */
export type ReportedMessage = {
  messageId: string;
  body: string;
  authorId: string | null;
  createdAt: Date;
  entityType: StreamEntityType;
  entityId: string;
  reports: number;
  reasons: ReportReason[];
  lastReportAt: Date;
};
export type ReportedMessageView = Omit<ReportedMessage, "authorId"> & { authorName: string };

export interface ChatReportStore {
  /** Registra a denúncia como o usuário. "duplicate" se a pessoa já denunciou; "unavailable" se a RLS recusar (mensagem apagada, inexistente ou da própria pessoa). */
  report(reporterId: string, messageId: string, reason: ReportReason): Promise<"created" | "duplicate" | "unavailable">;
  /** Mensagens com denúncia em aberto, das denunciadas mais recentemente para as mais antigas (RLS: só a moderação). */
  listOpen(actorId: string, limit: number): Promise<ReportedMessage[]>;
  /** Fecha as denúncias em aberto da mensagem; devolve quantas eram. Apagar a mensagem é com o chamador. */
  resolve(actorId: string, messageId: string, resolution: "removed" | "kept"): Promise<number>;
}

/** #193 — Denunciar uma mensagem do chat. Uma denúncia por pessoa e mensagem (repetir não é erro). */
export class ReportChatMessage {
  constructor(private readonly reports: Pick<ChatReportStore, "report">) {}

  async execute(reporter: { id: string }, messageId: string, reason: ReportReason): Promise<Result<{ messageId: string }, DomainError>> {
    const outcome = await this.reports.report(reporter.id, messageId, reason);
    if (outcome === "unavailable") return err(new BusinessRuleError("message_unavailable", "Esta mensagem não pode ser denunciada (foi apagada ou é sua)."));
    return ok({ messageId });
  }
}

/** Quem modera: o id vem da sessão; a capacidade (`content:edit`) é conferida aqui e de novo na RLS. */
export type ReportModerator = { id: string; canModerate: boolean };

/** Fila de denúncias do backoffice, com o nome de quem escreveu (API pública de identity). */
export class ListChatReports {
  constructor(
    private readonly reports: Pick<ChatReportStore, "listOpen">,
    private readonly names: (userIds: string[]) => Promise<Map<string, string>>,
  ) {}

  async execute(moderator: ReportModerator): Promise<Result<ReportedMessageView[], DomainError>> {
    if (!moderator.canModerate) return err(new ForbiddenError());
    const open = await this.reports.listOpen(moderator.id, REPORTS_LIMIT);
    const ids = [...new Set(open.map((r) => r.authorId).filter((id): id is string => id !== null))];
    const names = ids.length > 0 ? await this.names(ids) : new Map<string, string>();
    return ok(open.map(({ authorId, ...rest }) => ({ ...rest, authorName: (authorId && names.get(authorId)) || "Usuário removido" })));
  }
}

/**
 * A moderação resolve as denúncias de uma mensagem: apaga a mensagem (some do chat) ou mantém. As duas saídas
 * fecham as denúncias e entram na trilha de auditoria (evento de domínio).
 */
export class ResolveChatReports {
  constructor(
    private readonly reports: Pick<ChatReportStore, "resolve">,
    private readonly messages: { remove(actorId: string, messageId: string): Promise<boolean> },
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(moderator: ReportModerator, messageId: string, intent: "remove" | "keep"): Promise<Result<{ messageId: string; resolved: number }, DomainError>> {
    if (!moderator.canModerate) return err(new ForbiddenError());
    // Apaga antes de fechar: se a mensagem já tinha sido apagada (pelo anfitrião), as denúncias fecham do mesmo jeito.
    if (intent === "remove") await this.messages.remove(moderator.id, messageId);
    const resolved = await this.reports.resolve(moderator.id, messageId, intent === "remove" ? "removed" : "kept");
    if (resolved === 0) return err(new NotFoundError("Denúncia"));
    await this.events.publish("live.ChatReportResolved", { messageId, resolvedBy: moderator.id, resolution: intent === "remove" ? "removed" : "kept" });
    return ok({ messageId, resolved });
  }
}
