// API pública do módulo partners.
import type { CurrentUser } from "@/modules/identity";
import { hasRole } from "@/modules/identity";
import { listApplications, listClaimsForReview, listMyClaims, partnerRepository } from "./composition";
import type { PartnerSession } from "./features/portal/require-partner";

export { ApplyForm } from "./features/apply/ui/apply-form";
export { ReviewQueue } from "./features/review/ui/review-queue";
export { PortalNav } from "./features/portal/ui/portal-nav";
export { portalSections } from "./features/portal/portal-sections";
export { requirePartner, type PartnerSession } from "./features/portal/require-partner";
export { ClaimButton } from "./features/claim-place/ui/claim-button";
export { ClaimReviewQueue } from "./features/claim-place/ui/claim-review-queue";
export type { PlaceClaimView } from "./domain/place-claim";
export { partnerKinds, type PartnerApplication, type PartnerKind, type PartnerStatus } from "./domain/partner";

/** Cadastro de parceiro do usuário logado (ou null se nunca pediu). */
export function myPartnerApplication(user: CurrentUser) {
  return partnerRepository().findByOwner(user.id);
}

/** Fila de revisão (admin). */
export function partnerApplicationsForReview(user: CurrentUser) {
  return listApplications().execute({ id: user.id, isAdmin: hasRole(user, "admin") }, "pending");
}

/** Pedidos de vínculo do parceiro logado (com o nome dos lugares). */
export function myPlaceClaims({ user, partner }: PartnerSession) {
  return listMyClaims().execute({ userId: user.id, partnerId: partner.id });
}

/** Pedidos de vínculo pendentes (admin). */
export function placeClaimsForReview(user: CurrentUser) {
  return listClaimsForReview().execute({ id: user.id, isAdmin: hasRole(user, "admin") });
}
