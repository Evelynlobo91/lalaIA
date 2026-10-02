import "server-only";
import { getCurrentUser } from "@/modules/identity";
import { jsonRoute } from "@/shared/http/json-route";
import { UnauthorizedError, err } from "@/shared/kernel";
import { reportMessageSchema, type ReportChatMessage } from "./report-chat-message.use-case";

/** POST /api/live/chat/reports — denunciar uma mensagem do chat. Só logado; quem denuncia vem da sessão. */
export function reportChatMessageRoute(useCase: () => ReportChatMessage) {
  return jsonRoute(
    reportMessageSchema,
    async (input) => {
      const user = await getCurrentUser();
      if (!user) return err(new UnauthorizedError("Entre para denunciar."));
      return useCase().execute({ id: user.id }, input.messageId, input.reason);
    },
    { successStatus: 201 },
  );
}
