// API pública do módulo partners.
import type { CurrentUser } from "@/modules/identity";
import type { ModuleSubscriptions } from "@/shared/events";
import { can } from "@/modules/identity";
import {
  activatePartnerUseCase,
  canSponsor,
  endSponsorshipsWithoutPlan,
  listMySponsorships,
  sponsorshipRepository,
  approvedPartnerIdOf,
  listActivePartners,
  listApplications,
  partnerCountsReader,
  listClaimsForReview,
  listMyClaims,
  listPartnerOffers,
  myRedemptionsUseCase,
  offerRepository,
  offerTargetOptions,
  partnerRepository,
} from "./composition";
import type { PartnerSession } from "./features/portal/require-partner";
import { editableOffer as editableOfferValues } from "./features/manage-offers/partner-offers";
import type { OfferTargetOption } from "./features/manage-offers/ui/offer-form";

export { ApplyForm } from "./features/apply/ui/apply-form";
export { ReviewQueue } from "./features/review/ui/review-queue";
export { ActivePartnersList } from "./features/suspend-partner/ui/active-partners-list";
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
  return listApplications().execute({ id: user.id, isAdmin: can(user, "partners:review") }, "pending");
}

/** Parceiros aprovados e suspensos (admin), para suspender ou reativar (#144). */
export function activePartnersForAdmin(user: CurrentUser) {
  return listActivePartners().execute({ id: user.id, isAdmin: can(user, "partners:review") });
}

/** Pedidos de vínculo do parceiro logado (com o nome dos lugares). */
export function myPlaceClaims({ user, partner }: PartnerSession) {
  return listMyClaims().execute({ userId: user.id, partnerId: partner.id });
}

// Descontos e promoções (#30).
export { OffersSection } from "./features/redeem-offer/ui/offers-section";
export { MyRedemptionsCard } from "./features/redeem-offer/ui/my-redemptions-card";
export { OfferForm, type OfferTargetOption } from "./features/manage-offers/ui/offer-form";
export { EndOfferButton } from "./features/manage-offers/ui/end-offer-button";
export { ValidateCodeForm } from "./features/validate-code/ui/validate-code-form";
export type { MyRedemptionItem } from "./features/redeem-offer/offer-views";
export type { PartnerOfferItem } from "./features/manage-offers/partner-offers";
export type { OfferAvailability } from "./domain/offer";

/** "Meus resgates" (perfil e exportação LGPD): códigos, ofertas e onde valem. */
export function myRedemptions(userId: string) {
  return myRedemptionsUseCase().execute(userId);
}

/** Ofertas do parceiro logado (portal), com o nome do lugar/evento e quantos códigos já foram usados. */
export function myOffers({ user, partner }: PartnerSession) {
  return listPartnerOffers().execute({ userId: user.id, partnerId: partner.id });
}

/** Ofertas criadas pela pessoa (exportação LGPD); vazio se ela não é parceira aprovada. */
export async function offersCreatedBy(userId: string) {
  const partnerId = await approvedPartnerIdOf(userId);
  return partnerId ? listPartnerOffers().execute({ userId, partnerId }) : [];
}

/** Lugares que o parceiro gerencia e eventos seus que ainda não terminaram (opções do formulário de oferta). */
export async function offerTargetChoices({ user }: PartnerSession): Promise<OfferTargetOption[]> {
  const owned = await offerTargetOptions(user.id);
  return owned.map((t) => ({ value: `${t.type}:${t.id}`, label: t.name, type: t.type }));
}

/** Valores para editar a oferta; null se não for do parceiro ou já tiver sido resgatada/encerrada. */
export function editableOffer({ user, partner }: PartnerSession, offerId: string) {
  return editableOfferValues(offerRepository(), { userId: user.id, partnerId: partner.id }, offerId);
}

/** Pedidos de vínculo pendentes (admin). */
export function placeClaimsForReview(user: CurrentUser) {
  return listClaimsForReview().execute({ id: user.id, isAdmin: can(user, "partners:review") });
}

/** Contagens de parceiros (aprovados num período e ativos hoje), para as métricas gerais do backoffice (#145). */
export const partnerCounts = () => partnerCountsReader();

// Ativação a partir de dados coletados pelo time (#150): o CRM converte o lead sem duplicar o cadastro.
export type { PartnerActivation, ActivatedPartner } from "./features/activate-partner/activate-partner";
import type { PartnerActivation } from "./features/activate-partner/activate-partner";

/**
 * Cria (ou completa) o cadastro de parceiro já aprovado para uma conta e vincula o lugar, se houver.
 * Quem chama responde pela autorização (ex.: convite validado). Idempotente.
 */
export function activatePartner(input: PartnerActivation) {
  return activatePartnerUseCase().execute(input);
}

// Destaque patrocinado (#29).
export { EndSponsorshipButton, StartSponsorshipForm } from "./features/visibility/ui/sponsorship-forms";
export { MAX_ACTIVE_SPONSORSHIPS, type SponsorshipItem } from "./features/visibility/visibility.use-cases";

/** Destaques do parceiro logado e se o plano dele libera o destaque. */
export async function mySponsorships({ user, partner }: PartnerSession) {
  const [items, entitled] = await Promise.all([listMySponsorships().execute({ userId: user.id, partnerId: partner.id }), canSponsor(user.id)]);
  return { items, entitled };
}

/** Lugares e eventos com destaque valendo agora, como chaves `place:<id>` / `event:<id>` (para a Recomendação). */
export function sponsoredKeysNow(): Promise<string[]> {
  return sponsorshipRepository().activeKeys(new Date());
}

/**
 * Reações a eventos de outros módulos (registradas no boot, em src/bootstrap).
 * Assinatura suspensa → se a conta perdeu o direito ao destaque, os destaques dela são encerrados.
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("billing.SubscriptionSuspended", async (event) => {
    await endSponsorshipsWithoutPlan().execute(event.payload.ownerId);
  });
};
