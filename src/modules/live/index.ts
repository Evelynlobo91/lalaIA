// API pública do módulo live (transmissões ao vivo de lugares e eventos).
import { hasRole, type CurrentUser } from "@/modules/identity";
import type { ModuleSubscriptions } from "@/shared/events";
import { endStreamOfCancelledEvent, handleProviderWebhook, listActiveStreamsUseCase, listLiveTargets } from "./composition";
import type { ActiveStream } from "./features/player/player.use-case";
import { eventCancelledSchema } from "./features/stream-control/stream-control.schema";
import { webhooksRoute } from "./features/webhooks/webhooks.route";
import "./domain/events";
import type { LivePortalView } from "./features/stream-key/stream-key.use-case";

export { LiveTargetsList, StreamStatusBadge } from "./features/stream-key/ui/live-targets-list";
export { BroadcastInstructions } from "./features/stream-key/ui/broadcast-instructions";
export { LivePrivacyNotice } from "./features/stream-key/ui/live-privacy-notice";
export type { LivePortalView, LiveTargetView } from "./features/stream-key/stream-key.use-case";
export { LivePlayerFor } from "./features/player/ui/live-player-for";
export type { ActiveStream, LivePlayback } from "./features/player/player.use-case";
export { STATUS_LABELS, type StreamStatus, type StreamEntityType } from "./domain/stream";

/** Portal /parceiro/live: lugares e eventos do parceiro com a transmissão de cada um (sem a chave). */
export function livePortal(user: CurrentUser): Promise<LivePortalView> {
  return listLiveTargets().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });
}

/** Transmissões ao vivo agora (para Recomendação e Mapa). Só ids: quem chama busca os próprios dados. */
export function listActiveStreams(limit?: number): Promise<ActiveStream[]> {
  return listActiveStreamsUseCase().execute(limit);
}

export const liveApi = {
  /** POST /api/live/webhooks — webhooks assinados do provedor (Mux ou simulado). */
  webhooks: webhooksRoute(handleProviderWebhook),
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
};
