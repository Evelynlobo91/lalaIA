// Composição do módulo live (interna): usada pelas actions, rotas e pelo index.ts.
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import { ListLiveTargets, ProvisionStream, RevealStreamKey, RotateStreamKey } from "./features/stream-key/stream-key.use-case";
import { GetLivePlayback, ListActiveStreams } from "./features/player/player.use-case";
import { GetLiveStatus } from "./features/stream-states/stream-states.use-case";
import { ControlStream, EndStreamOfCancelledEvent } from "./features/stream-control/stream-control.use-case";
import { HandleProviderWebhook } from "./features/webhooks/webhooks.use-case";
import { streamingProviderFrom } from "./infra/live-config";
import { PostgresStreamLifecycleLog } from "./infra/postgres-stream-lifecycle-log";
import { PostgresStreamRepository } from "./infra/postgres-stream-repository";
import { ModuleStreamTargets } from "./infra/stream-targets";

/** Mux com MUX_TOKEN_ID; senão, o simulado. Criado no primeiro uso (páginas sem live não exigem a configuração). */
export const streamingProvider = lazy(() => streamingProviderFrom(process.env));

export const streamRepository = lazy(() => new PostgresStreamRepository(sql()));
const streamTargets = new ModuleStreamTargets();

export const provisionStream = lazy(() => new ProvisionStream(streamRepository(), streamTargets, streamingProvider));
export const rotateStreamKey = lazy(() => new RotateStreamKey(streamRepository(), streamingProvider));
export const revealStreamKey = lazy(() => new RevealStreamKey(streamRepository()));
export const listLiveTargets = lazy(() => new ListLiveTargets(streamRepository(), streamTargets, streamingProvider));

export const lifecycleLog = lazy(() => new PostgresStreamLifecycleLog(sql()));
export const handleProviderWebhook = lazy(() => new HandleProviderWebhook(streamingProvider, lifecycleLog(), domainEvents()));

export const controlStream = lazy(() => new ControlStream(streamRepository(), streamRepository(), streamingProvider, domainEvents()));
export const endStreamOfCancelledEvent = lazy(() => new EndStreamOfCancelledEvent(streamRepository(), streamRepository(), streamingProvider, domainEvents()));

export const getLivePlayback = lazy(() => new GetLivePlayback(streamRepository(), streamingProvider));
export const listActiveStreamsUseCase = lazy(() => new ListActiveStreams(streamRepository()));
export const getLiveStatus = lazy(() => new GetLiveStatus(getLivePlayback()));
