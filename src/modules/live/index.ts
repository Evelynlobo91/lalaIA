// API pública do módulo live (transmissões ao vivo de lugares e eventos).
import { hasRole, type CurrentUser } from "@/modules/identity";
import type { ModuleSubscriptions } from "@/shared/events";
import { getCtaPanel, liveCountsReader } from "./composition";
import { toLocalInput } from "@/shared/time/joinville-time";
import type { CtaRecord } from "./domain/cta";
import type { CtaPanel } from "./features/schedule-cta/schedule-cta.use-case";
import type { CtaFormValues } from "./features/schedule-cta/ui/cta-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { endStreamsWithoutPlan } from "./composition";
import { endStreamOfCancelledEvent, endStreamsOfDeletedUser, getActiveStreams, getStreamMetrics, privacyGate, getLiveNowGeo, getLiveStatus, handleProviderWebhook, listActiveStreamsUseCase, listLiveNow, listLiveTargets, streamRepository } from "./composition";
import { liveNowRoute } from "./features/live-badge/live-badge.route";
import type { LiveNowItem } from "./features/live-badge/live-badge.use-case";
import { errorReporter, logger } from "@/shared/observability";
import { liveStatusRoute } from "./features/stream-states/stream-states.route";
import type { ActiveStream } from "./features/player/player.use-case";
import { eventCancelledSchema } from "./features/stream-control/stream-control.schema";
import { webhooksRoute } from "./features/webhooks/webhooks.route";
import "./domain/events";
import type { LivePortalView } from "./features/stream-key/stream-key.use-case";
import type { StreamMetrics } from "./features/stream-metrics/stream-metrics.use-case";

export { LiveTargetsList, StreamStatusBadge } from "./features/stream-key/ui/live-targets-list";
export { BroadcastInstructions } from "./features/stream-key/ui/broadcast-instructions";
export { LivePrivacyNotice } from "./features/stream-key/ui/live-privacy-notice";
export { LivePrivacyGuidelines } from "./features/privacy/ui/live-privacy-guidelines";
export type { LivePortalView, LiveTargetView } from "./features/stream-key/stream-key.use-case";
export type { StreamMetrics } from "./features/stream-metrics/stream-metrics.use-case";
export { LivePlayerFor } from "./features/player/ui/live-player-for";
export type { ActiveStream, LivePlayback } from "./features/player/player.use-case";
export type { LiveStatusView } from "./features/stream-states/stream-states.use-case";
export { LiveNowProvider } from "./features/live-badge/ui/live-now-provider";
export { LiveMapLayers } from "./features/live-badge/ui/live-map-layers";
export { LiveNowList } from "./features/live-badge/ui/live-now-list";
export type { LiveNowItem } from "./features/live-badge/live-badge.use-case";
export { STATUS_LABELS, type StreamStatus, type StreamEntityType } from "./domain/stream";

// CTAs programados (#93).
export { CtaForm, type CtaFormValues } from "./features/schedule-cta/ui/cta-form";
export { DeleteCtaButton } from "./features/schedule-cta/ui/delete-cta-button";
export { TriggerCtaButton } from "./features/trigger-cta/ui/trigger-cta-button";
export { CTA_LIMITS, CTA_PRIORITY_LABELS, CTA_TYPE_LABELS, describeSchedule, type CtaRecord } from "./domain/cta";
export type { CtaPanel } from "./features/schedule-cta/schedule-cta.use-case";
export type { ActiveCtaView } from "./features/active-cta/active-cta.use-case";

/** Chamadas (CTAs) de uma transmissão do parceiro, com a agenda do dia; null se a transmissão não é dele. */
export function liveCtaPanel(user: CurrentUser, streamId: string): Promise<CtaPanel | null> {
  if (!UUID.test(streamId)) return Promise.resolve(null);
  return getCtaPanel().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") }, streamId);
}

/** Valores de um CTA para preencher o formulário de edição. */
export function ctaFormValues(cta: CtaRecord): CtaFormValues {
  const s = cta.schedule;
  return {
    ctaId: cta.id,
    type: cta.type,
    refId: cta.refId ?? "",
    url: cta.type === "link" ? cta.href : "",
    title: cta.title,
    body: cta.body ?? "",
    buttonLabel: cta.buttonLabel,
    priority: String(cta.priority),
    scheduleKind: s.kind,
    startsAt: s.kind === "absolute" ? toLocalInput(s.startsAt) : "",
    endsAt: s.kind === "absolute" ? toLocalInput(s.endsAt) : "",
    offsetMinutes: s.kind === "relative" ? String(s.offsetMinutes) : "",
    durationMinutes: s.kind === "absolute" ? "" : String(s.durationMinutes),
    intervalMinutes: s.kind === "recurring" ? String(s.intervalMinutes) : "",
  };
}

/** Portal /parceiro/live: lugares e eventos do parceiro com a transmissão de cada um (sem a chave). */
export function livePortal(user: CurrentUser): Promise<LivePortalView> {
  return listLiveTargets().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });
}

/** Quando o parceiro aceitou as diretrizes de privacidade vigentes (#55), ou null: sem aceite, nada vai ao ar. */
export function livePrivacyAcceptedAt(user: CurrentUser): Promise<Date | null> {
  return privacyGate().acceptedAt(user.id);
}

/**
 * Métricas das transmissões do parceiro (RF25), por id da transmissão: quantas vezes assistiram e acessos à
 * página. Só contagens (o Analytics não guarda quem). Se o Analytics falhar, o portal segue sem métricas.
 */
export async function liveMetrics(user: CurrentUser): Promise<Record<string, StreamMetrics>> {
  try {
    return await getStreamMetrics().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });
  } catch (error) {
    logger().error("falha ao carregar as métricas da live", { err: error });
    errorReporter().capture(error);
    return {};
  }
}

/**
 * Transmissões de um parceiro (qualquer situação), com o lugar/evento de cada uma. Usado pelo painel de
 * dados do promotor (Analytics) para ligar os `live_view` (por transmissão) ao recurso. O id vem da sessão.
 */
export async function liveStreamsOf(ownerId: string): Promise<Array<{ streamId: string; entityType: "place" | "event"; entityId: string }>> {
  return (await streamRepository().listByOwner(ownerId)).map((s) => ({ streamId: s.id, entityType: s.entityType, entityId: s.entityId }));
}

/** Transmissões ao vivo agora (para Recomendação e Mapa). Só ids: quem chama busca os próprios dados. */
export function listActiveStreams(limit?: number): Promise<ActiveStream[]> {
  return listActiveStreamsUseCase().execute(limit);
}

/** "Com live agora" (RF20): lives no ar com nome, lugar, horário e link. */
export function liveNow(): Promise<LiveNowItem[]> {
  return listLiveNow().execute();
}

/**
 * Chaves `tipo:id` das lives no ar, para o `LiveNowProvider` das listas e do detalhe (estado inicial do
 * selo). A live é um complemento: se a consulta falhar, a página segue sem selo.
 */
export async function liveNowKeys(): Promise<string[]> {
  try {
    return (await listActiveStreams()).map((s) => `${s.entityType}:${s.entityId}`).sort();
  } catch (error) {
    logger().error("falha ao carregar as lives no ar", { err: error });
    errorReporter().capture(error);
    return [];
  }
}

export const liveApi = {
  /** GET /api/live/active — lives no ar (só tipo e id), para o selo "Ao vivo" se atualizar sozinho. */
  active: liveNowRoute(getActiveStreams),
  /** GET /api/live/map — lives no ar como GeoJSON (camada do mapa). */
  map: liveNowRoute(getLiveNowGeo),
  /** POST /api/live/webhooks — webhooks assinados do provedor (Mux ou simulado). */
  webhooks: webhooksRoute(handleProviderWebhook),
  /** GET /api/live/status?entityType=&entityId= — status atual para a página trocar de estado sozinha. */
  status: liveStatusRoute(getLiveStatus),
};

/**
 * Reações a eventos de outros módulos (registradas no boot, em src/bootstrap).
 * Evento cancelado → a live dele é encerrada (chave desativada no provedor).
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("events.EventCancelled", async (event) => {
    const parsed = eventCancelledSchema.safeParse(event.payload);
    if (parsed.success) await endStreamOfCancelledEvent().execute(parsed.data.eventId);
  });
  bus.subscribe("identity.UserDeleted", async (event) => {
    await endStreamsOfDeletedUser().execute(event.payload.userId);
  });
  // Inadimplência (#154): sem direito à live no plano que sobrou, as transmissões do dono são encerradas.
  bus.subscribe("billing.SubscriptionSuspended", async (event) => {
    await endStreamsWithoutPlan().execute(event.payload.ownerId);
  });
};

/** Contagem de transmissões que estiveram no ar num período, para as métricas gerais do backoffice (#145). */
export const liveCounts = () => liveCountsReader();
