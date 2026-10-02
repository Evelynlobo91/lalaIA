import { z } from "zod";
import { BusinessRuleError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { CHAT_LIMITS, containsLink, tidyMessage, type ChatMessage, type ChatMessageView, type ChatRoom, type ContentFilter } from "../../domain/chat";

export const sendChatMessageSchema = z.object({
  streamId: z.uuid(),
  body: z.string().max(1000),
  replyTo: z.uuid().nullish(),
});

/** Sala do chat de uma transmissão (leitura do sistema); null se a transmissão não existe. */
export interface ChatRoomReader {
  room(streamId: string): Promise<ChatRoom | null>;
}

/** Grava a mensagem como o usuário (RLS confere de novo: chat aberto, selo de anfitrião, resposta da mesma live). */
export interface ChatMessageWriter {
  /** null se o banco recusar (o chat fechou entre a checagem e a gravação). */
  insert(userId: string, message: { streamId: string; body: string; isHost: boolean; replyTo: string | null }): Promise<ChatMessage | null>;
  /** Mensagem visível (não apagada) da transmissão, para a citação da resposta. */
  findVisible(streamId: string, messageId: string): Promise<ChatMessage | null>;
}

/** Quando a pessoa mandou a última mensagem nesta transmissão (Postgres no início; Redis se escalar, #56). */
export interface ChatRateLimiter {
  lastMessageAt(streamId: string, userId: string): Promise<Date | null>;
}

/** O plano do dono da transmissão libera o chat? (porta implementada pela API pública do módulo billing) */
export type ChatEntitlement = (ownerId: string) => Promise<boolean>;

/** Monta a mensagem para a tela (autor com nome, foto e nível; citação da resposta). */
export interface ChatMessagePresenter {
  present(messages: ChatMessage[]): Promise<ChatMessageView[]>;
}

const closed = (message: string) => err(new BusinessRuleError("chat_closed", message));

/**
 * #187 — Enviar mensagem no chat da live. Tudo conferido no servidor, nesta ordem: chat aberto (live no ar, chat
 * ligado e plano com chat) → tamanho → links (só o anfitrião manda) → filtro de conteúdo → intervalo entre
 * mensagens. O id de quem envia vem sempre da sessão.
 */
export class SendChatMessage {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly messages: ChatMessageWriter,
    private readonly filter: ContentFilter,
    private readonly rate: ChatRateLimiter,
    private readonly entitled: ChatEntitlement,
    private readonly presenter: ChatMessagePresenter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(sender: { id: string }, input: { streamId: string; body: string; replyTo?: string | null }): Promise<Result<ChatMessageView, DomainError>> {
    const room = await this.rooms.room(input.streamId);
    if (!room) return err(new NotFoundError("Transmissão"));
    if (room.status !== "live") return closed("O chat fecha quando a live não está no ar.");
    if (!room.chatEnabled || !(await this.entitled(room.ownerId))) return closed("O chat desta live está desligado.");

    const body = tidyMessage(input.body);
    if (!body) return invalid("Escreva uma mensagem.");
    if (body.length > CHAT_LIMITS.body) return invalid(`Use no máximo ${CHAT_LIMITS.body} caracteres.`);

    const isHost = room.ownerId === sender.id;
    if (!isHost && containsLink(body)) return err(new BusinessRuleError("link_blocked", "Links não são permitidos no chat."));
    if (!this.filter.allows(body)) return err(new BusinessRuleError("content_blocked", "Mensagem bloqueada: mantenha o respeito no chat."));

    const last = await this.rate.lastMessageAt(room.streamId, sender.id);
    const waitMs = last ? CHAT_LIMITS.rateSeconds * 1000 - (this.now().getTime() - last.getTime()) : 0;
    if (waitMs > 0) return err(new BusinessRuleError("rate_limited", `Aguarde ${Math.ceil(waitMs / 1000)} s para enviar outra mensagem.`));

    // Resposta a mensagem que sumiu (apagada ou de outra live): envia sem a citação.
    const replyTo = input.replyTo && (await this.messages.findVisible(room.streamId, input.replyTo)) ? input.replyTo : null;

    const saved = await this.messages.insert(sender.id, { streamId: room.streamId, body, isHost, replyTo });
    if (!saved) return closed("O chat fecha quando a live não está no ar.");
    const [view] = await this.presenter.present([saved]);
    return ok(view);
  }
}

const invalid = (message: string) => err(new ValidationError("Mensagem inválida.", [{ path: ["body"], message }]));
