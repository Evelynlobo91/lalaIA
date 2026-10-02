import type { Lead, LeadStage } from "./lead";

/** Etapas em que a negociação está aberta. */
export const openStages = ["lead", "contato", "proposta"] as const satisfies readonly LeadStage[];
const isOpen = (stage: LeadStage) => (openStages as readonly LeadStage[]).includes(stage);

/**
 * Para onde um lead pode ir a partir de uma etapa:
 * - aberto → qualquer outra etapa aberta, ou perdido (com motivo);
 * - perdido → reabre em qualquer etapa aberta;
 * - ativo → não se move mais;
 * - ninguém vai para "ativo" à mão: isso é a conversão em parceiro (#150).
 */
export function nextStages(from: LeadStage): LeadStage[] {
  if (from === "ativo") return [];
  const open = openStages.filter((stage) => stage !== from);
  return from === "perdido" ? [...open] : [...open, "perdido"];
}

export const canMove = (from: LeadStage, to: LeadStage) => nextStages(from).includes(to) && (isOpen(to) || to === "perdido");

export type StageChange = { from: LeadStage; to: LeadStage; changedBy: string | null; reason: string | null; changedAt: Date };

/** Mudança de etapa e histórico. `actorId` vem da sessão; as consultas rodam "como ele" sob RLS. */
export interface LeadPipeline {
  /**
   * Move o lead de `from` para `to` e registra no histórico, na mesma transação.
   * null se o lead não existe ou já saiu de `from` (outra pessoa moveu antes).
   */
  move(actorId: string, leadId: string, from: LeadStage, to: LeadStage, reason: string | null): Promise<Lead | null>;
  /** Do mais recente para o mais antigo. */
  history(actorId: string, leadId: string): Promise<StageChange[]>;
}
