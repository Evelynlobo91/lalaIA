export const leadSources = [
  { id: "instagram", label: "Instagram" },
  { id: "indicacao", label: "Indicação" },
  { id: "visita", label: "Visita" },
  { id: "outro", label: "Outro" },
] as const;
export type LeadSource = (typeof leadSources)[number]["id"];

/** Etapas do funil, na ordem em que aparecem. "ativo" e "perdido" encerram a negociação. */
export const leadStages = [
  { id: "lead", label: "Lead" },
  { id: "contato", label: "Contato" },
  { id: "proposta", label: "Proposta" },
  { id: "ativo", label: "Parceiro ativo" },
  { id: "perdido", label: "Perdido" },
] as const;
export type LeadStage = (typeof leadStages)[number]["id"];

export const sourceLabel = (id: LeadSource) => leadSources.find((s) => s.id === id)!.label;
export const stageLabel = (id: LeadStage) => leadStages.find((s) => s.id === id)!.label;

/** Dados editáveis do lead (o que o formulário grava). */
export type LeadData = {
  businessName: string;
  contactName: string;
  /** Só dígitos, com DDD (e +55 opcional). */
  contactPhone: string | null;
  contactEmail: string | null;
  source: LeadSource;
  /** Responsável: alguém do time com `leads:write`. */
  ownerId: string;
};

export type Lead = Omit<LeadData, "ownerId"> & {
  id: string;
  /** null quando a conta do responsável foi excluída. */
  ownerId: string | null;
  stage: LeadStage;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Quem age no CRM. As capacidades vêm do papel (#157) e são conferidas de novo em cada caso de uso. */
export type CrmActor = { id: string; canRead: boolean; canWrite: boolean };

/**
 * Persistência dos leads. `actorId` é quem está agindo (vem da sessão): as consultas rodam "como ele"
 * sob RLS, então o banco também barra quem não tem a capacidade.
 */
export interface LeadRepository {
  create(actorId: string, data: LeadData): Promise<Lead>;
  /** null se o lead não existe (ou a RLS não deixa ver). */
  update(actorId: string, leadId: string, data: LeadData): Promise<Lead | null>;
  findById(actorId: string, leadId: string): Promise<Lead | null>;
  /** Mais recentemente atualizados primeiro. */
  list(actorId: string, limit: number): Promise<Lead[]>;
}

/** Pessoas do time que podem ser responsáveis por leads (API pública do módulo identity). */
export interface LeadOwners {
  list(): Promise<Array<{ id: string; name: string }>>;
}
