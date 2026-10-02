// Composição do módulo crm (interna): usada pelas actions e pelo index.ts.
import { usersWithCapability } from "@/modules/identity";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { LeadOwners } from "./domain/lead";
import { GetLead, ListLeads, SaveLead } from "./features/leads/leads.use-cases";
import { PostgresLeadRepository } from "./infra/postgres-lead-repository";

// Responsáveis possíveis: quem tem leads:write, pela API pública do módulo identity.
export const leadOwners: LeadOwners = {
  list: async () => (await usersWithCapability("leads:write")).map((u) => ({ id: u.id, name: u.displayName })),
};

export const leadRepository = lazy(() => new PostgresLeadRepository(sql()));
export const saveLead = lazy(() => new SaveLead(leadRepository(), leadOwners));
export const listLeads = lazy(() => new ListLeads(leadRepository(), leadOwners));
export const getLead = lazy(() => new GetLead(leadRepository()));
