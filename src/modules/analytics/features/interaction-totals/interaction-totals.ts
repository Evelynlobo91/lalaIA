import { ValidationError, err, ok, type Result } from "@/shared/kernel";
import type { InteractionEntityType, InteractionKind } from "../../domain/interaction";
import { interactionTotalsSchema } from "./interaction-totals.schema";

/** Contagem por entidade e tipo: `{ [entityId]: { view: 12, live_view: 3 } }`. Entidade sem interação fica de fora. */
export type InteractionTotals = Record<string, Partial<Record<InteractionKind, number>>>;

/** Porta de leitura agregada (uma consulta, pelo índice por entidade). Nunca devolve quem fez. */
export interface InteractionTotalsReader {
  totals(entityType: InteractionEntityType, entityIds: string[], since: Date | null): Promise<Array<{ entityId: string; kind: InteractionKind; total: number }>>;
}

/**
 * RF25 — Totais de interações por entidade (ex.: métricas da live no portal do parceiro), desde `since`
 * ou desde sempre. Só contagens: o Analytics não guarda quem fez (LGPD).
 */
export class GetInteractionTotals {
  constructor(private readonly reader: InteractionTotalsReader) {}

  async execute(input: unknown): Promise<Result<InteractionTotals, ValidationError>> {
    const parsed = interactionTotalsSchema.safeParse(input);
    if (!parsed.success) return err(new ValidationError("Consulta de totais inválida.", parsed.error.issues));
    const ids = [...new Set(parsed.data.entityIds)];
    if (ids.length === 0) return ok({});

    const rows = await this.reader.totals(parsed.data.entityType, ids, parsed.data.since ?? null);
    const totals: InteractionTotals = {};
    for (const { entityId, kind, total } of rows) (totals[entityId] ??= {})[kind] = total;
    return ok(totals);
  }
}
