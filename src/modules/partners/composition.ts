// Composição do módulo (injeção de dependências). Interno: usado pelas actions e pelo index.ts.
import { usersByIds } from "@/modules/identity";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { SubmitPartnerApplication } from "./features/apply/apply.use-case";
import { ApprovePartner, ListPartnerApplications, RejectPartner } from "./features/review/review.use-cases";
import { identityRoleGranter } from "./infra/identity-role-granter";
import { placesLookup } from "./infra/places-lookup";
import { PostgresPlaceClaimRepository } from "./infra/postgres-place-claim-repository";
import {
  ApprovePlaceClaim,
  ListClaimsForReview,
  ListMyClaims,
  RejectPlaceClaim,
  RequestPlaceClaim,
} from "./features/claim-place/claim-place.use-cases";
import { PostgresPartnerRepository } from "./infra/postgres-partner-repository";

export const partnerRepository = lazy(() => new PostgresPartnerRepository(sql(), usersByIds));
export const submitApplication = lazy(() => new SubmitPartnerApplication(partnerRepository()));
export const listApplications = lazy(() => new ListPartnerApplications(partnerRepository()));
export const approvePartner = lazy(() => new ApprovePartner(partnerRepository(), identityRoleGranter, domainEvents()));
export const rejectPartner = lazy(() => new RejectPartner(partnerRepository()));

export const claimRepository = lazy(() => new PostgresPlaceClaimRepository(sql()));
export const requestClaim = lazy(() => new RequestPlaceClaim(claimRepository(), placesLookup));
export const listMyClaims = lazy(() => new ListMyClaims(claimRepository(), placesLookup));
export const listClaimsForReview = lazy(() => new ListClaimsForReview(claimRepository(), placesLookup));
export const approveClaim = lazy(() => new ApprovePlaceClaim(claimRepository(), domainEvents()));
export const rejectClaim = lazy(() => new RejectPlaceClaim(claimRepository()));
