// API pública do módulo live (transmissões ao vivo de lugares e eventos).
import { hasRole, type CurrentUser } from "@/modules/identity";
import { listLiveTargets } from "./composition";
import type { LivePortalView } from "./features/stream-key/stream-key.use-case";

export { LiveTargetsList, StreamStatusBadge } from "./features/stream-key/ui/live-targets-list";
export { BroadcastInstructions } from "./features/stream-key/ui/broadcast-instructions";
export { LivePrivacyNotice } from "./features/stream-key/ui/live-privacy-notice";
export type { LivePortalView, LiveTargetView } from "./features/stream-key/stream-key.use-case";
export { STATUS_LABELS, type StreamStatus, type StreamEntityType } from "./domain/stream";

/** Portal /parceiro/live: lugares e eventos do parceiro com a transmissão de cada um (sem a chave). */
export function livePortal(user: CurrentUser): Promise<LivePortalView> {
  return listLiveTargets().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });
}
