// Composição do módulo live (interna): usada pelas actions, rotas e pelo index.ts.
import { hasPlanFeature } from "@/modules/billing";
import { liveGateWith } from "./features/privacy/live-gate";
import { EndStreamsWithoutPlan } from "./features/stream-control/plan-suspension";
import { sql } from "@/shared/db/sql";
import { logger } from "@/shared/observability";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import { ListLiveTargets, ProvisionStream, RevealStreamKey, RotateStreamKey } from "./features/stream-key/stream-key.use-case";
import { GetLivePlayback, ListActiveStreams } from "./features/player/player.use-case";
import { GetLiveStatus } from "./features/stream-states/stream-states.use-case";
import { GetActiveStreams, GetLiveNowGeo, ListLiveNow } from "./features/live-badge/live-badge.use-case";
import { ModuleLiveTargetDirectory } from "./infra/live-target-directory";
import { GetStreamMetrics } from "./features/stream-metrics/stream-metrics.use-case";
import { AnalyticsInteractionCounter } from "./infra/analytics-interaction-counter";
import { GetStreamContext, UpdateStreamNote } from "./features/stream-context/stream-context.use-case";
import { ControlStream, EndStreamOfCancelledEvent, EndStreamsOfDeletedUser } from "./features/stream-control/stream-control.use-case";
import { HandleProviderWebhook } from "./features/webhooks/webhooks.use-case";
import { streamingProviderFrom } from "./infra/live-config";
import { AcceptLiveGuidelines, PrivacyGate } from "./features/privacy/privacy.use-case";
import { PostgresPrivacyAgreements } from "./infra/postgres-privacy-agreements";
import { PostgresStreamLifecycleLog } from "./infra/postgres-stream-lifecycle-log";
import { PostgresLiveCounts } from "./infra/postgres-live-counts";
import { PostgresStreamRepository } from "./infra/postgres-stream-repository";
import { ModuleStreamTargets } from "./infra/stream-targets";

/** Mux com MUX_TOKEN_ID; senão, o simulado. Criado no primeiro uso (páginas sem live não exigem a configuração). */
export const streamingProvider = lazy(() => streamingProviderFrom(process.env));

export const streamRepository = lazy(() => new PostgresStreamRepository(sql()));
const streamTargets = new ModuleStreamTargets();

export const privacyAgreements = lazy(() => new PostgresPrivacyAgreements(sql()));
export const privacyGate = lazy(() => new PrivacyGate(privacyAgreements()));

// Trava para colocar uma live no ar: plano com live (porta pública do módulo billing, #152) + diretrizes (#55).
export const liveGate = lazy(() => liveGateWith((ownerId) => hasPlanFeature(ownerId, "live"), privacyGate()));
export const acceptLiveGuidelines = lazy(() => new AcceptLiveGuidelines(privacyAgreements()));

export const provisionStream = lazy(() => new ProvisionStream(streamRepository(), streamTargets, streamingProvider, liveGate()));
export const rotateStreamKey = lazy(() => new RotateStreamKey(streamRepository(), streamingProvider));
export const revealStreamKey = lazy(() => new RevealStreamKey(streamRepository()));
export const listLiveTargets = lazy(() => new ListLiveTargets(streamRepository(), streamTargets, streamingProvider));

export const lifecycleLog = lazy(() => new PostgresStreamLifecycleLog(sql()));
export const liveCountsReader = lazy(() => new PostgresLiveCounts(sql()));
export const handleProviderWebhook = lazy(() => new HandleProviderWebhook(streamingProvider, lifecycleLog(), domainEvents()));

export const controlStream = lazy(() => new ControlStream(streamRepository(), streamRepository(), streamingProvider, domainEvents(), liveGate()));
export const endStreamOfCancelledEvent = lazy(() => new EndStreamOfCancelledEvent(streamRepository(), streamRepository(), streamingProvider, domainEvents()));
export const endStreamsWithoutPlan = lazy(
  () => new EndStreamsWithoutPlan(streamRepository(), streamRepository(), streamingProvider, (ownerId) => hasPlanFeature(ownerId, "live"), logger().child({ module: "live" })),
);
export const endStreamsOfDeletedUser = lazy(() => new EndStreamsOfDeletedUser(streamRepository(), streamingProvider, logger().child({ module: "live" })));

export const getLivePlayback = lazy(() => new GetLivePlayback({ findByTarget: (target) => streamRepository().findVisibleByTarget(target) }, streamingProvider));
export const listActiveStreamsUseCase = lazy(() => new ListActiveStreams(streamRepository()));
export const getLiveStatus = lazy(() => new GetLiveStatus(getLivePlayback()));

const targetDirectory = new ModuleLiveTargetDirectory();
export const listLiveNow = lazy(() => new ListLiveNow(streamRepository(), targetDirectory));
export const getActiveStreams = lazy(() => new GetActiveStreams(listActiveStreamsUseCase()));
export const getLiveNowGeo = lazy(() => new GetLiveNowGeo(listLiveNow()));

export const updateStreamNote = lazy(() => new UpdateStreamNote(streamRepository(), streamRepository()));
export const getStreamContext = lazy(() => new GetStreamContext(targetDirectory));
export const getStreamMetrics = lazy(() => new GetStreamMetrics(streamRepository(), new AnalyticsInteractionCounter()));
