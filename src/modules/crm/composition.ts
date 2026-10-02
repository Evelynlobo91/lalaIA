// Composição do módulo crm (interna): usada pelas actions e pelo index.ts.
import { usersByIds, usersWithCapability } from "@/modules/identity";
import { activatePartner } from "@/modules/partners";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { localDate } from "@/shared/time/joinville-time";
import type { LeadOwners } from "./domain/lead";
import { GetConversionBySource } from "./features/lead-reports/lead-reports";
import { GetLead, ListLeads, SaveLead } from "./features/leads/leads.use-cases";
import { AcceptInvite, GetInvite, StartConversion } from "./features/convert-lead/convert-lead.use-cases";
import { AddLeadNote, CompleteFollowUp, GetLeadActivity, ListMyFollowUps, SetNextStep } from "./features/follow-ups/follow-ups.use-cases";
import { GetLeadHistory, MoveLead } from "./features/pipeline/pipeline.use-cases";
import { inviteTokens } from "./infra/invite-tokens";
import { PostgresInviteStore } from "./infra/postgres-invite-store";
import { PostgresLeadActivity } from "./infra/postgres-lead-activity";
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

// Anotações e follow-ups (#149). "Hoje" é o dia no calendário de Joinville.
export const crmToday = () => localDate(new Date());
export const leadActivity = lazy(() => new PostgresLeadActivity(sql()));
export const addLeadNote = lazy(() => new AddLeadNote(leadActivity()));
export const setNextStep = lazy(() => new SetNextStep(leadActivity(), crmToday));
export const completeFollowUp = lazy(() => new CompleteFollowUp(leadActivity()));
export const getLeadActivity = lazy(() => new GetLeadActivity(leadActivity(), userNames, crmToday));
export const listMyFollowUps = lazy(() => new ListMyFollowUps(leadActivity(), crmToday));

// Conversão em parceiro por convite (#150). O parceiro é criado pela API pública do módulo partners.
export const inviteStore = lazy(() => new PostgresInviteStore(sql()));
export const startConversion = lazy(() => new StartConversion(leadRepository(), inviteStore(), inviteTokens));
export const getInvite = lazy(() => new GetInvite(inviteStore(), inviteTokens));
export const acceptInvite = lazy(() => new AcceptInvite(inviteStore(), inviteTokens, { activate: activatePartner }));

// Relatório de conversão por origem (#151).
export const getConversionBySource = lazy(() => new GetConversionBySource(leadRepository()));
