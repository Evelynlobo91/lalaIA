// Composição do módulo (injeção de dependências). Interno: usado pelas actions e pelo index.ts.
import { usersByIds } from "@/modules/identity";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { SubmitPartnerApplication } from "./features/apply/apply.use-case";
import { ApprovePartner, ListPartnerApplications, RejectPartner } from "./features/review/review.use-cases";
import { identityRoleGranter } from "./infra/identity-role-granter";
import { PostgresPartnerRepository } from "./infra/postgres-partner-repository";

export const partnerRepository = lazy(() => new PostgresPartnerRepository(sql(), usersByIds));
export const submitApplication = lazy(() => new SubmitPartnerApplication(partnerRepository()));
export const listApplications = lazy(() => new ListPartnerApplications(partnerRepository()));
export const approvePartner = lazy(() => new ApprovePartner(partnerRepository(), identityRoleGranter, domainEvents()));
export const rejectPartner = lazy(() => new RejectPartner(partnerRepository()));
