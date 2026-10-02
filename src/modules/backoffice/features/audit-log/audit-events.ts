import type { DomainEventMap } from "@/shared/events";
import type { AuditTargetType } from "../../domain/audit";

type Mapped<K extends keyof DomainEventMap> = {
  /** Texto da ação na tela. */
  label: string;
  targetType: AuditTargetType;
  /** Quem agiu e em quê, a partir do payload do evento. */
  from(payload: DomainEventMap[K]): { actorId: string; targetId: string };
};

const on = <K extends keyof DomainEventMap>(mapped: Mapped<K>) => mapped;

/**
 * Eventos de domínio que viram registro de auditoria (#146). Uma ação administrativa nova entra aqui
 * com uma linha: o módulo dono publica o evento com quem agiu, e o backoffice só assina.
 */
export const auditedEvents = {
  "identity.RoleGranted": on<"identity.RoleGranted">({ label: "Concedeu um papel interno", targetType: "user", from: (p) => ({ actorId: p.grantedBy, targetId: p.userId }) }),
  "identity.RoleRevoked": on<"identity.RoleRevoked">({ label: "Revogou um papel interno", targetType: "user", from: (p) => ({ actorId: p.revokedBy, targetId: p.userId }) }),
  "partners.PartnerApproved": on<"partners.PartnerApproved">({ label: "Aprovou o cadastro do parceiro", targetType: "partner", from: (p) => ({ actorId: p.approvedBy, targetId: p.partnerId }) }),
  "partners.PartnerRejected": on<"partners.PartnerRejected">({ label: "Recusou o cadastro do parceiro", targetType: "partner", from: (p) => ({ actorId: p.rejectedBy, targetId: p.partnerId }) }),
  "partners.PartnerSuspended": on<"partners.PartnerSuspended">({ label: "Suspendeu o parceiro", targetType: "partner", from: (p) => ({ actorId: p.suspendedBy, targetId: p.partnerId }) }),
  "partners.PartnerReactivated": on<"partners.PartnerReactivated">({ label: "Reativou o parceiro", targetType: "partner", from: (p) => ({ actorId: p.reactivatedBy, targetId: p.partnerId }) }),
  "partners.PlaceClaimApproved": on<"partners.PlaceClaimApproved">({ label: "Aprovou o vínculo com o lugar", targetType: "place_claim", from: (p) => ({ actorId: p.approvedBy, targetId: p.claimId }) }),
  "partners.PlaceClaimRejected": on<"partners.PlaceClaimRejected">({ label: "Recusou o vínculo com o lugar", targetType: "place_claim", from: (p) => ({ actorId: p.rejectedBy, targetId: p.claimId }) }),
  "places.PlaceCreatedByAdmin": on<"places.PlaceCreatedByAdmin">({ label: "Cadastrou o estabelecimento", targetType: "place", from: (p) => ({ actorId: p.createdBy, targetId: p.placeId }) }),
  "places.PlaceEditedByAdmin": on<"places.PlaceEditedByAdmin">({ label: "Editou o lugar", targetType: "place", from: (p) => ({ actorId: p.editedBy, targetId: p.placeId }) }),
  "events.EventEditedByAdmin": on<"events.EventEditedByAdmin">({ label: "Editou o evento", targetType: "event", from: (p) => ({ actorId: p.editedBy, targetId: p.eventId }) }),
  "events.EventCancelledByAdmin": on<"events.EventCancelledByAdmin">({ label: "Cancelou o evento", targetType: "event", from: (p) => ({ actorId: p.cancelledBy, targetId: p.eventId }) }),
  "missions.MissionEditedByAdmin": on<"missions.MissionEditedByAdmin">({ label: "Editou a missão", targetType: "mission", from: (p) => ({ actorId: p.editedBy, targetId: p.missionId }) }),
  "missions.MissionArchivedByAdmin": on<"missions.MissionArchivedByAdmin">({ label: "Encerrou a missão", targetType: "mission", from: (p) => ({ actorId: p.archivedBy, targetId: p.missionId }) }),
  "live.CtaDisabledByAdmin": on<"live.CtaDisabledByAdmin">({ label: "Desativou a chamada da live", targetType: "live_cta", from: (p) => ({ actorId: p.disabledBy, targetId: p.ctaId }) }),
  "live.CtaEnabledByAdmin": on<"live.CtaEnabledByAdmin">({ label: "Reativou a chamada da live", targetType: "live_cta", from: (p) => ({ actorId: p.enabledBy, targetId: p.ctaId }) }),
  "live.ChatReportResolved": on<"live.ChatReportResolved">({ label: "Resolveu denúncia de mensagem do chat", targetType: "chat_message", from: (p) => ({ actorId: p.resolvedBy, targetId: p.messageId }) }),
} satisfies { [K in keyof DomainEventMap]?: Mapped<K> };

export type AuditedEvent = keyof typeof auditedEvents;

export const auditedEventTypes = Object.keys(auditedEvents) as AuditedEvent[];

/** Nome da ação gravado no banco: o próprio tipo do evento, em minúsculas com sublinhado (`partners.partner_suspended`). */
export function actionOf(type: AuditedEvent): string {
  const [module, name] = type.split(".");
  return `${module}.${name.replace(/(?<!^)([A-Z])/g, "_$1").toLowerCase()}`;
}

const labels = new Map(auditedEventTypes.map((type) => [actionOf(type), auditedEvents[type].label]));

/** Texto da ação para a tela; ações antigas que saíram do catálogo aparecem pelo nome gravado. */
export const actionLabel = (action: string) => labels.get(action) ?? action;

/** Ações conhecidas, para o filtro da tela. */
export const auditActions = auditedEventTypes.map((type) => ({ action: actionOf(type), label: auditedEvents[type].label }));
