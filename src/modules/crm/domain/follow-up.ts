export type LeadNote = { id: string; body: string; authorId: string | null; createdAt: Date };

/** Próximo passo combinado com o lead: o que fazer e até que dia ("YYYY-MM-DD", calendário de Joinville). */
export type FollowUp = { id: string; leadId: string; description: string; dueOn: string; doneAt: Date | null };

/** Follow-up em aberto com os dados do lead, para a lista "meus follow-ups". */
export type DueFollowUp = FollowUp & { businessName: string; contactName: string; contactPhone: string | null };

/** Atrasado: o dia combinado já passou. */
export const isOverdue = (dueOn: string, today: string) => dueOn < today;

/** "2026-10-10" → "10/10/2026". */
export const formatDay = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

/** Anotações e follow-ups. `actorId` vem da sessão; as consultas rodam "como ele" sob RLS. */
export interface LeadActivity {
  /** false se o lead não existe (ou a RLS não deixa ver). */
  addNote(actorId: string, leadId: string, body: string): Promise<boolean>;
  notes(actorId: string, leadId: string): Promise<LeadNote[]>;
  /** Define o próximo passo; se já houver um em aberto, ele é substituído. null se o lead não existe. */
  setNextStep(actorId: string, leadId: string, description: string, dueOn: string): Promise<FollowUp | null>;
  openFollowUp(actorId: string, leadId: string): Promise<FollowUp | null>;
  /** Conclui o follow-up; null se não existe ou já estava concluído. */
  complete(actorId: string, followUpId: string): Promise<FollowUp | null>;
  /** Follow-ups em aberto, com dia até `until` (inclusive), dos leads sob responsabilidade de `ownerId`; os mais antigos primeiro. */
  dueFor(actorId: string, ownerId: string, until: string): Promise<DueFollowUp[]>;
}
