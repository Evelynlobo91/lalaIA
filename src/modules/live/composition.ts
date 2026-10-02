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
import { ctaLinkDomainsFrom } from "./domain/cta";
import { GetActiveCta } from "./features/active-cta/active-cta.use-case";
import { ctaTypeHandlers } from "./features/schedule-cta/cta-types";
import { DeleteCta, GetCtaPanel, SaveCta, type CtaEntitlement } from "./features/schedule-cta/schedule-cta.use-case";
import { StopCtaTrigger, TriggerCta } from "./features/trigger-cta/trigger-cta.use-case";
import { GetCtaMetrics } from "./features/cta-metrics/cta-metrics.use-case";
import { ListCtasForModeration, ModerateCta } from "./features/moderate-cta/moderate-cta.use-case";
import { ModuleCtaCatalog } from "./infra/cta-catalog";
import { WordListFilter, blockedWordsFrom } from "./domain/chat";
import { ChatPresenter, GetChatFeed } from "./features/chat-feed/chat-feed.use-case";
import { SendChatMessage, type ChatEntitlement } from "./features/send-chat-message/send-chat-message.use-case";
import { ModuleChatAuthors } from "./infra/chat-authors";
import { PostgresChatRepository } from "./infra/postgres-chat-repository";
import { ToggleMessageLike } from "./features/like-chat-message/like-chat-message.use-case";
import { LivePulse } from "./features/live-presence/live-presence.use-case";
import { InMemoryRateLimiter, SendReactions, ToggleLiveLike } from "./features/react-to-live/react-to-live.use-case";
import { PostgresReactionRepository } from "./infra/postgres-reaction-repository";
import { LiftChatRestriction, ListChatRestrictions, ModerateChatMessage, SaveChatSettings } from "./features/moderate-chat/moderate-chat.use-case";
import { PostgresChatModeration } from "./infra/postgres-chat-moderation";
import { publicProfiles } from "@/modules/identity";
import { PostgresCtaRepository } from "./infra/postgres-cta-repository";

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
export const getActiveCta = lazy(() => new GetActiveCta(ctaRepository(), logger().child({ module: "live" })));
export const getLiveStatus = lazy(() => new GetLiveStatus(getLivePlayback(), getActiveCta()));

const targetDirectory = new ModuleLiveTargetDirectory();
export const listLiveNow = lazy(() => new ListLiveNow(streamRepository(), targetDirectory));
export const getActiveStreams = lazy(() => new GetActiveStreams(listActiveStreamsUseCase()));
export const getLiveNowGeo = lazy(() => new GetLiveNowGeo(listLiveNow()));

export const updateStreamNote = lazy(() => new UpdateStreamNote(streamRepository(), streamRepository()));
export const getStreamContext = lazy(() => new GetStreamContext(targetDirectory));
export const getStreamMetrics = lazy(() => new GetStreamMetrics(streamRepository(), new AnalyticsInteractionCounter()));

// CTAs programados (#93). O direito vem do plano (recurso `cta`), pela porta pública do módulo billing.
export const ctaRepository = lazy(() => new PostgresCtaRepository(sql()));
const ctaEntitled: CtaEntitlement = (ownerId) => hasPlanFeature(ownerId, "cta");
const ctaHandlers = lazy(() => ctaTypeHandlers(new ModuleCtaCatalog(targetDirectory), ctaLinkDomainsFrom(process.env.LIVE_CTA_LINK_DOMAINS)));
export const saveCta = lazy(() => new SaveCta(streamRepository(), ctaRepository(), ctaHandlers(), ctaEntitled));
export const deleteCta = lazy(() => new DeleteCta(ctaRepository()));
export const getCtaPanel = lazy(() => new GetCtaPanel(streamRepository(), ctaRepository(), ctaHandlers(), ctaEntitled));
export const triggerCta = lazy(() => new TriggerCta(ctaRepository(), streamRepository(), ctaRepository(), ctaEntitled));
export const stopCtaTrigger = lazy(() => new StopCtaTrigger(ctaRepository()));
export const getCtaMetrics = lazy(() => new GetCtaMetrics(new AnalyticsInteractionCounter()));
export const listCtasForModeration = lazy(() => new ListCtasForModeration(ctaRepository()));
export const moderateCta = lazy(() => new ModerateCta(ctaRepository(), domainEvents()));

// Chat da live (#95). O direito vem do plano do dono da transmissão (recurso `chat`). A resposta do billing é
// guardada por 30 s por conta: o chat é consultado a cada poucos segundos por cada espectador.
const CHAT_PLAN_TTL_MS = 30_000;
const chatPlanCache = new Map<string, { at: number; value: Promise<boolean> }>();
export const chatEntitled: ChatEntitlement = (ownerId) => {
  const now = Date.now();
  const cached = chatPlanCache.get(ownerId);
  if (cached && now - cached.at < CHAT_PLAN_TTL_MS) return cached.value;
  const value = hasPlanFeature(ownerId, "chat");
  chatPlanCache.set(ownerId, { at: now, value });
  // Falha não fica guardada: a próxima consulta tenta de novo.
  value.catch(() => chatPlanCache.delete(ownerId));
  if (chatPlanCache.size > 500) for (const [key, entry] of chatPlanCache) if (now - entry.at >= CHAT_PLAN_TTL_MS) chatPlanCache.delete(key);
  return value;
};
export const chatRepository = lazy(() => new PostgresChatRepository(sql()));
const chatPresenter = lazy(() => new ChatPresenter(chatRepository(), new ModuleChatAuthors()));
const chatFilter = lazy(() => new WordListFilter(blockedWordsFrom(process.env.LIVE_CHAT_BLOCKED_WORDS)));
export const sendChatMessage = lazy(() => new SendChatMessage(chatRepository(), chatRepository(), chatFilter(), chatRepository(), chatEntitled, chatPresenter(), undefined, chatRepository()));
export const getChatFeed = lazy(() => new GetChatFeed(chatRepository(), chatRepository(), chatEntitled, chatPresenter()));

// Curtidas, reações e espectadores (#189, #190, #191): valem com a live no ar e o recurso `chat` no plano.
export const reactionRepository = lazy(() => new PostgresReactionRepository(sql()));
const reactionLimiter = new InMemoryRateLimiter();
export const toggleLiveLike = lazy(() => new ToggleLiveLike(chatRepository(), reactionRepository(), chatEntitled));
export const sendReactions = lazy(() => new SendReactions(chatRepository(), reactionRepository(), chatEntitled, reactionLimiter));
export const toggleMessageLike = lazy(() => new ToggleMessageLike(reactionRepository()));
export const livePulse = lazy(() => new LivePulse(chatRepository(), reactionRepository(), reactionRepository(), chatEntitled));

// Moderação do chat pelo anfitrião (#192).
const chatModeration = lazy(() => new PostgresChatModeration(sql()));
export const moderateChatMessage = lazy(() => new ModerateChatMessage(chatRepository(), chatModeration()));
export const saveChatSettings = lazy(() => new SaveChatSettings(chatRepository(), chatModeration()));
export const liftChatRestriction = lazy(() => new LiftChatRestriction(chatModeration()));
export const listChatRestrictions = lazy(
  () => new ListChatRestrictions(chatModeration(), async (ids) => new Map((await publicProfiles(ids)).map((p) => [p.id, p.displayName]))),
);
