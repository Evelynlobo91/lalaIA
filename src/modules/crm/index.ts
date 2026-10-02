// API pública do módulo crm (captação de estabelecimentos: leads e funil).
import type { CurrentUser } from "@/modules/identity";
import { crmToday, getLead, getLeadActivity, getLeadHistory, leadOwners, listLeads, listMyFollowUps } from "./composition";
import { crmActor } from "./features/leads/crm-actor";
import type { LeadStage } from "./domain/lead";
import type { LeadFormValues } from "./features/leads/ui/lead-form";

export { LeadForm, type LeadFormValues } from "./features/leads/ui/lead-form";
export { leadSources, leadStages, sourceLabel, stageLabel, type Lead, type LeadSource, type LeadStage } from "./domain/lead";
export type { LeadListItem } from "./features/leads/leads.use-cases";
export { LeadActivityPanel, MyFollowUpsList } from "./features/follow-ups/ui/lead-activity";
export type { LeadActivityView, MyFollowUp } from "./features/follow-ups/follow-ups.use-cases";
export { LeadBoard } from "./features/pipeline/ui/lead-board";
export { LeadHistory } from "./features/pipeline/ui/lead-history";
export { MoveLeadForm } from "./features/pipeline/ui/move-lead-form";
export type { StageChangeView } from "./features/pipeline/pipeline.use-cases";

type Viewer = Pick<CurrentUser, "id" | "roles">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leads para /admin/leads (quem tem `leads:read`), com o nome do responsável. */
export function leadsFor(viewer: Viewer) {
  return listLeads().execute(crmActor(viewer));
}

/** Pessoas do time que podem ser responsáveis por um lead. */
export function leadOwnerOptions() {
  return leadOwners.list();
}

/** Lead para o formulário de edição; null se não existir ou a pessoa não tiver acesso. */
export async function editableLead(viewer: Viewer, leadId: string): Promise<{ values: LeadFormValues; businessName: string; stage: LeadStage; lostReason: string | null } | null> {
  if (!UUID.test(leadId)) return null;
  const result = await getLead().execute(crmActor(viewer), leadId);
  if (!result.ok) return null;
  const lead = result.value;
  return {
    businessName: lead.businessName,
    stage: lead.stage,
    lostReason: lead.lostReason,
    values: {
      leadId: lead.id,
      businessName: lead.businessName,
      contactName: lead.contactName,
      contactPhone: lead.contactPhone ?? "",
      contactEmail: lead.contactEmail ?? "",
      source: lead.source,
      ownerId: lead.ownerId ?? "",
    },
  };
}

/** Histórico de etapas do lead (#148), com o nome de quem moveu; vazio se a pessoa não tiver acesso. */
export async function leadHistory(viewer: Viewer, leadId: string) {
  if (!UUID.test(leadId)) return [];
  const result = await getLeadHistory().execute(crmActor(viewer), leadId);
  return result.ok ? result.value : [];
}

/** Hoje no calendário de Joinville ("YYYY-MM-DD"), para o campo de data do próximo passo. */
export const leadsToday = () => crmToday();

/** Próximo passo em aberto e anotações do lead (#149); null se a pessoa não tiver acesso. */
export async function leadActivityFor(viewer: Viewer, leadId: string) {
  if (!UUID.test(leadId)) return null;
  const result = await getLeadActivity().execute(crmActor(viewer), leadId);
  return result.ok ? result.value : null;
}

/** "Meus follow-ups de hoje": os de hoje e os atrasados, dos leads sob responsabilidade de quem pergunta. */
export async function myFollowUps(viewer: Viewer) {
  const result = await listMyFollowUps().execute(crmActor(viewer));
  return result.ok ? result.value : [];
}
