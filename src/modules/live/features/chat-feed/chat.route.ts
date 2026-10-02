import "server-only";
import { getCurrentUser } from "@/modules/identity";
import { jsonRoute, queryRoute } from "@/shared/http/json-route";
import { UnauthorizedError, err } from "@/shared/kernel";
import type { SendChatMessage } from "../send-chat-message/send-chat-message.use-case";
import { sendChatMessageSchema } from "../send-chat-message/send-chat-message.use-case";
import { chatFeedQuerySchema, type GetChatFeed } from "./chat-feed.use-case";

/**
 * GET /api/live/chat?streamId=&version= — histórico e atualização do chat. Público: visitante lê. Sem cache:
 * as mensagens mudam a todo momento.
 */
export function chatFeedRoute(useCase: () => GetChatFeed) {
  const route = queryRoute(chatFeedQuerySchema, (input) => useCase().execute(input));
  return async (request: Request) => {
    const response = await route(request);
    response.headers.set("cache-control", "no-store");
    return response;
  };
}

/** POST /api/live/chat — enviar mensagem. Só logado; quem envia vem da sessão, nunca do corpo. */
export function sendChatMessageRoute(useCase: () => SendChatMessage) {
  return jsonRoute(
    sendChatMessageSchema,
    async (input) => {
      const user = await getCurrentUser();
      if (!user) return err(new UnauthorizedError("Entre para participar do chat."));
      return useCase().execute({ id: user.id }, input);
    },
    { successStatus: 201 },
  );
}
