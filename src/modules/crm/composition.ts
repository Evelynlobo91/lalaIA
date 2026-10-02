// Composição do módulo crm (interna): usada pelas actions e pelo index.ts.
import { usersByIds, usersWithCapability } from "@/modules/identity";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { LeadOwners } from "./domain/lead";
import { GetLead, ListLeads, SaveLead } from "./features/leads/leads.use-cases";
import { GetLeadHistory, MoveLead } from "./features/pipeline/pipeline.use-cases";
import { PostgresLeadPipeline } from "./infra/postgres-lead-pipeline";
import { PostgresLeadRepository } from "./infra/postgres-lead-repository";

// Responsáveis possíveis: quem tem leads:write, pela API pública do módulo identity.
export const leadOwners: LeadOwners = {
  list: async () => (await usersWithCapability("leads:write")).map((u) => ({ id: u.id, name: u.displayName })),
};

export const leadRepository = lazy(() => new PostgresLeadRepository(sql()));
export const saveLead = lazy(() => new SaveLead(leadRepository(), leadOwners));
export const listLeads = lazy(() => new ListLeads(leadRepository(), leadOwners));
export const getLead = lazy(() => new GetLead(leadRepository()));

// Funil (#148). Nome de quem moveu: pela API pública do módulo identity.
const userNames = async (ids: string[]) => new Map((await usersByIds(ids)).map((u) => [u.id, u.displayName]));
export const leadPipeline = lazy(() => new PostgresLeadPipeline(sql()));
export const moveLead = lazy(() => new MoveLead(leadRepository(), leadPipeline()));
export const getLeadHistory = lazy(() => new GetLeadHistory(leadPipeline(), userNames));
