import "server-only";
import { can, getCurrentUser } from "@/modules/identity";
import { jsonRoute } from "@/shared/http/json-route";
import { UnauthorizedError, err } from "@/shared/kernel";
import { moderateMessageSchema, type ModerateChatMessage } from "./moderate-chat.use-case";

/**
 * POST /api/live/chat/moderation — apagar, fixar, silenciar ou banir a partir de uma mensagem. Quem age vem da
 * sessão; o caso de uso confere se é o anfitrião, a moderação ou (só para apagar) o autor.
 */
export function moderateChatRoute(useCase: () => ModerateChatMessage) {
  return jsonRoute(moderateMessageSchema, async (input) => {
    const user = await getCurrentUser();
    if (!user) return err(new UnauthorizedError("Entre para moderar o chat."));
    return useCase().execute({ id: user.id, canModerateAll: can(user, "content:edit") }, input.messageId, input.action);
  });
}
