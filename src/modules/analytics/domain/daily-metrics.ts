import type { InteractionEntityType, InteractionKind } from "./interaction";

/** Total de um tipo de interação de uma entidade num dia (calendário de Joinville, "AAAA-MM-DD"). */
export type DailyMetric = {
  day: string;
  entityType: InteractionEntityType;
  entityId: string;
  kind: InteractionKind;
  total: number;
};

/** Quais entidades consultar, agrupadas por tipo (ex.: lugares + eventos + missões + lives de um parceiro). */
export type EntityRefs = Partial<Record<InteractionEntityType, string[]>>;

export type DailyMetricsQuery = {
  refs: EntityRefs;
  /** Dias inclusivos, "AAAA-MM-DD". */
  from: string;
  to: string;
};

/** Porta de leitura das agregações diárias (#77). */
export interface DailyMetricsReader {
  daily(query: DailyMetricsQuery & { today: string }): Promise<DailyMetric[]>;
}
