// API pública do módulo crm (captação de estabelecimentos: leads e funil).
import type { CurrentUser } from "@/modules/identity";
import { getLead, leadOwners, listLeads } from "./composition";
import { crmActor } from "./features/leads/crm-actor";
import type { LeadFormValues } from "./features/leads/ui/lead-form";

export { LeadForm, type LeadFormValues } from "./features/leads/ui/lead-form";
export { leadSources, leadStages, sourceLabel, stageLabel, type Lead, type LeadSource, type LeadStage } from "./domain/lead";
export type { LeadListItem } from "./features/leads/leads.use-cases";

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
export async function editableLead(viewer: Viewer, leadId: string): Promise<{ values: LeadFormValues; businessName: string } | null> {
  if (!UUID.test(leadId)) return null;
  const result = await getLead().execute(crmActor(viewer), leadId);
  if (!result.ok) return null;
  const lead = result.value;
  return {
    businessName: lead.businessName,
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
