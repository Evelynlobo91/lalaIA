import "server-only";
import { getCurrentUser } from "@/modules/identity";
import { jsonRoute, queryRoute } from "@/shared/http/json-route";
import { UnauthorizedError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { MessageLikeStore, ToggleMessageLike } from "../like-chat-message/like-chat-message.use-case";
import { likeMessageSchema, myLikesQuerySchema } from "../like-chat-message/like-chat-message.use-case";
import { pulseSchema, type LivePulse } from "../live-presence/live-presence.use-case";
import { sendReactionsSchema, toggleLikeSchema, type SendReactions, type ToggleLiveLike } from "./react-to-live.use-case";

const noStore = (route: (request: Request) => Promise<Response>) => async (request: Request) => {
  const response = await route(request);
  response.headers.set("cache-control", "no-store");
  return response;
};

/** Quem age vem sempre da sessão, nunca do corpo. Visitante recebe 401 com um convite para entrar. */
async function asViewer<T>(message: string, run: (user: { id: string }) => Promise<Result<T, DomainError>>): Promise<Result<T, DomainError>> {
  const user = await getCurrentUser();
  return user ? run({ id: user.id }) : err(new UnauthorizedError(message));
}

/** POST /api/live/pulse — batimento da aba que está assistindo; devolve espectadores, curtidas e reações. Público. */
export const pulseRoute = (useCase: () => LivePulse) => noStore(jsonRoute(pulseSchema, (input) => useCase().execute(input)));

/** POST /api/live/likes — curtir (ou descurtir) a live. Só logado. */
export const liveLikeRoute = (useCase: () => ToggleLiveLike) =>
  jsonRoute(toggleLikeSchema, (input) => asViewer("Entre para curtir a live.", (user) => useCase().execute(user, input.streamId)));

/** POST /api/live/reactions — lote de reações rápidas. Só logado. */
export const reactionsRoute = (useCase: () => SendReactions) =>
  jsonRoute(sendReactionsSchema, (input) => asViewer("Entre para reagir.", (user) => useCase().execute(user, input.streamId, input.counts)));

/** POST /api/live/chat/likes — curtir (ou descurtir) uma mensagem. Só logado. */
export const messageLikeRoute = (useCase: () => ToggleMessageLike) =>
  jsonRoute(likeMessageSchema, (input) => asViewer("Entre para curtir mensagens.", (user) => useCase().execute(user, input.messageId)));

/** GET /api/live/chat/likes?streamId= — o que a pessoa logada já curtiu nesta live (visitante: nada). */
export const myLikesRoute = (likes: () => Pick<MessageLikeStore, "mine">) =>
  noStore(
    queryRoute(myLikesQuerySchema, async (input) => {
      const user = await getCurrentUser();
      return ok(user ? await likes().mine(user.id, input.streamId) : { messageIds: [], likedLive: false, ownMessageIds: [] });
    }),
  );
