// Composição do módulo (injeção de dependências). Interno: usado pelas actions e pelo index.ts.
import { hasPlanFeature } from "@/modules/billing";
import { usersByIds } from "@/modules/identity";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { SubmitPartnerApplication } from "./features/apply/apply.use-case";
import { ApprovePartner, ListPartnerApplications, RejectPartner } from "./features/review/review.use-cases";
import { ListActivePartners, ReactivatePartner, SuspendPartner } from "./features/suspend-partner/suspend-partner.use-cases";
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
import { ActivatePartner } from "./features/activate-partner/activate-partner";
import { PostgresPartnerActivation } from "./infra/postgres-partner-activation";
import { PostgresPartnerRepository } from "./infra/postgres-partner-repository";
import { PostgresPartnerCounts } from "./infra/postgres-partner-counts";
import { PostgresOfferRepository, PostgresRedemptionRepository } from "./infra/postgres-offer-repository";
import { offerTargets } from "./infra/offer-targets";
import { EndOffer, SaveOffer } from "./features/manage-offers/manage-offers.use-cases";
import { ListPartnerOffers } from "./features/manage-offers/partner-offers";
import { RedeemOffer } from "./features/redeem-offer/redeem-offer.use-case";
import { MyRedemptions, OffersForTarget } from "./features/redeem-offer/offer-views";
import { ValidateOfferCode } from "./features/validate-code/validate-code.use-case";
import { EndSponsorship, EndSponsorshipsWithoutPlan, ListMySponsorships, StartSponsorship, type VisibilityEntitlement } from "./features/visibility/visibility.use-cases";
import { PostgresSponsorshipRepository } from "./infra/postgres-sponsorship-repository";
import { InviteTeamMember, RemoveTeamMember, ValidateCodeAtCounter, type CounterStaffing } from "./features/team-members/team-members.use-case";
import { PostgresTeamRepository } from "./infra/postgres-team-repository";

export const partnerRepository = lazy(() => new PostgresPartnerRepository(sql(), usersByIds));
export const partnerCountsReader = lazy(() => new PostgresPartnerCounts(sql()));
export const submitApplication = lazy(() => new SubmitPartnerApplication(partnerRepository()));
export const listApplications = lazy(() => new ListPartnerApplications(partnerRepository()));
export const approvePartner = lazy(() => new ApprovePartner(partnerRepository(), identityRoleGranter, domainEvents()));
export const activatePartnerUseCase = lazy(() => new ActivatePartner(new PostgresPartnerActivation(sql()), placesLookup, identityRoleGranter, domainEvents()));
export const rejectPartner = lazy(() => new RejectPartner(partnerRepository(), domainEvents()));
export const listActivePartners = lazy(() => new ListActivePartners(partnerRepository()));
export const suspendPartner = lazy(() => new SuspendPartner(partnerRepository(), domainEvents()));
export const reactivatePartner = lazy(() => new ReactivatePartner(partnerRepository(), domainEvents()));

export const claimRepository = lazy(() => new PostgresPlaceClaimRepository(sql()));
export const requestClaim = lazy(() => new RequestPlaceClaim(claimRepository(), placesLookup));
export const listMyClaims = lazy(() => new ListMyClaims(claimRepository(), placesLookup));
export const listClaimsForReview = lazy(() => new ListClaimsForReview(claimRepository(), placesLookup));
export const approveClaim = lazy(() => new ApprovePlaceClaim(claimRepository(), domainEvents()));
export const rejectClaim = lazy(() => new RejectPlaceClaim(claimRepository(), domainEvents()));

// Descontos e promoções (#30).
export const offerRepository = lazy(() => new PostgresOfferRepository(sql()));
export const redemptionRepository = lazy(() => new PostgresRedemptionRepository(sql()));
const targets = lazy(() => offerTargets());

/** Cadastro de parceiro aprovado da pessoa (null se não tiver). */
export async function approvedPartnerIdOf(userId: string): Promise<string | null> {
  const partner = await partnerRepository().findByOwner(userId);
  return partner?.status === "approved" ? partner.id : null;
}

export const saveOffer = lazy(() => new SaveOffer(offerRepository(), targets()));
export const endOffer = lazy(() => new EndOffer(offerRepository()));
export const listPartnerOffers = lazy(() => new ListPartnerOffers(offerRepository(), targets()));
export const redeemOffer = lazy(() => new RedeemOffer(offerRepository(), redemptionRepository(), approvedPartnerIdOf, domainEvents()));
export const offersForTarget = lazy(() => new OffersForTarget(offerRepository(), redemptionRepository(), approvedPartnerIdOf));
export const myRedemptionsUseCase = lazy(() => new MyRedemptions(redemptionRepository(), targets()));
export const validateOfferCode = lazy(() => new ValidateOfferCode(redemptionRepository(), domainEvents()));
export const offerTargetOptions = (userId: string) => targets().ownedBy(userId);

// Destaque patrocinado (#29). O direito vem do plano, pela porta pública do módulo billing.
export const canSponsor: VisibilityEntitlement = (ownerId) => hasPlanFeature(ownerId, "destaque");
export const sponsorshipRepository = lazy(() => new PostgresSponsorshipRepository(sql()));
export const startSponsorship = lazy(() => new StartSponsorship(sponsorshipRepository(), targets(), canSponsor));
export const endSponsorship = lazy(() => new EndSponsorship(sponsorshipRepository()));
export const listMySponsorships = lazy(() => new ListMySponsorships(sponsorshipRepository(), targets()));
export const endSponsorshipsWithoutPlan = lazy(() => new EndSponsorshipsWithoutPlan(sponsorshipRepository(), canSponsor));

// Equipe do parceiro (#158): o dono convida; o membro só atende no balcão (valida códigos).
export const teamRepository = lazy(() => new PostgresTeamRepository(sql()));
export const inviteTeamMember = lazy(() => new InviteTeamMember(teamRepository()));
export const removeTeamMember = lazy(() => new RemoveTeamMember(teamRepository()));
const counterStaffing: CounterStaffing = async (userId) => {
  const [own, memberships] = await Promise.all([approvedPartnerIdOf(userId), teamRepository().membershipsOf(userId)]);
  return [...(own ? [own] : []), ...memberships.map((m) => m.partnerId)];
};
export const validateCodeAtCounter = lazy(() => new ValidateCodeAtCounter(counterStaffing, validateOfferCode()));
