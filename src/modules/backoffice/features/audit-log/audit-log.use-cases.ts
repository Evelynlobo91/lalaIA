import { z } from "zod";
import type { DomainEvent, DomainEventMap } from "@/shared/events";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { AuditActors, AuditEntry, AuditLog } from "../../domain/audit";
import { actionLabel, actionOf, auditActions, auditedEvents, type AuditedEvent } from "./audit-events";

export const AUDIT_PAGE_SIZE = 100;
export const auditPeriods = [7, 30, 90] as const;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Filtros de /admin/auditoria, a partir da URL. Valores inválidos caem no padrão (30 dias, todas as ações, todo mundo). */
export const auditFilterSchema = z.object({
  periodo: z.preprocess(first, z.coerce.number().refine((v) => (auditPeriods as readonly number[]).includes(v)).catch(30)),
  acao: z.preprocess(first, z.string().refine((v) => auditActions.some((a) => a.action === v)).optional().catch(undefined)),
  quem: z.preprocess(first, z.uuid().optional().catch(undefined)),
});

export type AuditFilterInput = z.infer<typeof auditFilterSchema>;

/** Grava a ação administrativa de um evento de domínio. Idempotente (o evento pode ser entregue de novo). */
export class RecordAudit {
  constructor(private readonly log: Pick<AuditLog, "append">) {}

  async fromEvent<K extends AuditedEvent>(event: DomainEvent<DomainEventMap, K>): Promise<void> {
    const mapped = auditedEvents[event.type] as { targetType: AuditEntry["targetType"]; from(payload: DomainEventMap[K]): { actorId: string; targetId: string } };
    const { actorId, targetId } = mapped.from(event.payload);
    await this.log.append({ eventId: event.id, actorId, action: actionOf(event.type), targetType: mapped.targetType, targetId, occurredAt: event.occurredAt });
  }
}

export type AuditRow = { id: string; actorId: string; actorName: string; action: string; actionLabel: string; targetType: AuditEntry["targetType"]; targetId: string; occurredAt: Date };

export type AuditView = { filter: AuditFilterInput; rows: AuditRow[]; actors: Array<{ id: string; name: string }>; truncated: boolean };

/** Consulta da trilha (admin): por ação, por quem agiu e por período. */
export class ListAuditLog {
  constructor(
    private readonly log: Pick<AuditLog, "list">,
    private readonly actors: AuditActors,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(viewer: { isAdmin: boolean }, params: Record<string, unknown>): Promise<Result<AuditView, DomainError>> {
    if (!viewer.isAdmin) return err(new ForbiddenError());
    const filter = auditFilterSchema.parse(params);
    const since = new Date(this.now().getTime() - filter.periodo * 86_400_000);

    // Um a mais que a página: sabemos se há mais registros sem contar a tabela.
    const found = await this.log.list({ action: filter.acao, actorId: filter.quem, since, limit: AUDIT_PAGE_SIZE + 1 });
    const entries = found.slice(0, AUDIT_PAGE_SIZE);
    // Quem aparece no período (para o filtro "quem"), independente do filtro de pessoa aplicado.
    const inPeriod = filter.quem ? await this.log.list({ action: filter.acao, since, limit: AUDIT_PAGE_SIZE + 1 }) : found;
    const names = await this.actors.names([...new Set(inPeriod.map((e) => e.actorId))]);
    const nameOf = (id: string) => names.get(id) ?? "Conta removida";

    return ok({
      filter,
      rows: entries.map((e) => ({
        id: e.eventId,
        actorId: e.actorId,
        actorName: nameOf(e.actorId),
        action: e.action,
        actionLabel: actionLabel(e.action),
        targetType: e.targetType,
        targetId: e.targetId,
        occurredAt: e.occurredAt,
      })),
      actors: [...new Set(inPeriod.map((e) => e.actorId))].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      truncated: found.length > AUDIT_PAGE_SIZE,
    });
  }
}
