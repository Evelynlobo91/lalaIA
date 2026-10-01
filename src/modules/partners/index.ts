// API pública do módulo partners.
import type { CurrentUser } from "@/modules/identity";
import { hasRole } from "@/modules/identity";
import { listApplications, partnerRepository } from "./composition";

export { ApplyForm } from "./features/apply/ui/apply-form";
export { ReviewQueue } from "./features/review/ui/review-queue";
export { PortalNav } from "./features/portal/ui/portal-nav";
export { portalSections } from "./features/portal/portal-sections";
export { requirePartner, type PartnerSession } from "./features/portal/require-partner";
export { partnerKinds, type PartnerApplication, type PartnerKind, type PartnerStatus } from "./domain/partner";

/** Cadastro de parceiro do usuário logado (ou null se nunca pediu). */
export function myPartnerApplication(user: CurrentUser) {
  return partnerRepository().findByOwner(user.id);
}

/** Fila de revisão (admin). */
export function partnerApplicationsForReview(user: CurrentUser) {
  return listApplications().execute({ id: user.id, isAdmin: hasRole(user, "admin") }, "pending");
}
