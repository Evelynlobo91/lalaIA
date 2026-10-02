// Composição do módulo (injeção de dependências). Interno: usado pelas actions e pelo index.ts.
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
import { PostgresPartnerRepository } from "./infra/postgres-partner-repository";
import { PostgresOfferRepository, PostgresRedemptionRepository } from "./infra/postgres-offer-repository";
import { offerTargets } from "./infra/offer-targets";
import { EndOffer, SaveOffer } from "./features/manage-offers/manage-offers.use-cases";
import { ListPartnerOffers } from "./features/manage-offers/partner-offers";
import { RedeemOffer } from "./features/redeem-offer/redeem-offer.use-case";
import { MyRedemptions, OffersForTarget } from "./features/redeem-offer/offer-views";
import { ValidateOfferCode } from "./features/validate-code/validate-code.use-case";

export const partnerRepository = lazy(() => new PostgresPartnerRepository(sql(), usersByIds));
export const submitApplication = lazy(() => new SubmitPartnerApplication(partnerRepository()));
export const listApplications = lazy(() => new ListPartnerApplications(partnerRepository()));
export const approvePartner = lazy(() => new ApprovePartner(partnerRepository(), identityRoleGranter, domainEvents()));
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
