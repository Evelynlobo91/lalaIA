import { z } from "zod";
import { NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { CHAT_LIMITS, REMOVED_AUTHOR, excerptOf, type ChatAuthor, type ChatClosedReason, type ChatMessage, type ChatMessageView } from "../../domain/chat";
import type { ChatEntitlement, ChatMessagePresenter, ChatRoomReader } from "../send-chat-message/send-chat-message.use-case";

/** Intervalo da atualização do chat na POC (só com a aba visível). Evolução: Supabase Realtime (docs/live.md). */
export const CHAT_POLL_MS = 2_500;

export const chatFeedQuerySchema = z.object({
  streamId: z.uuid(),
  /** Versão que a tela já tem: se nada mudou, a resposta vem sem as mensagens. */
  version: z.string().max(60).optional(),
});

/** Leitura pública do chat (pelo sistema: o público não lê a tabela). */
export interface ChatFeedReader {
  /** Muda sempre que entra, some ou muda uma mensagem. Consulta barata, feita a cada atualização. */
  version(streamId: string): Promise<string>;
  /** As últimas mensagens visíveis, da mais antiga para a mais nova. */
  latest(streamId: string, limit: number): Promise<ChatMessage[]>;
  /** Mensagens (visíveis) por id, para a citação das respostas. */
  byIds(ids: string[]): Promise<ChatMessage[]>;
}

/** Nome, foto e nível de quem escreveu (APIs públicas de identity e progression). */
export interface ChatAuthors {
  describe(userIds: string[]): Promise<Map<string, ChatAuthor>>;
}

/**
 * `open`: dá para enviar. Fechado: `reason` diz por quê. `messages: null` = nada mudou desde a `version` da tela.
 */
export type ChatFeedView = { open: boolean; reason: ChatClosedReason | null; version: string; messages: ChatMessageView[] | null };

/** Autor e citação de cada mensagem, em lote (duas consultas, qualquer que seja a quantidade). */
export class ChatPresenter implements ChatMessagePresenter {
  constructor(
    private readonly feed: Pick<ChatFeedReader, "byIds">,
    private readonly authors: ChatAuthors,
  ) {}

  async present(messages: ChatMessage[]): Promise<ChatMessageView[]> {
    if (messages.length === 0) return [];
    const known = new Map(messages.map((m) => [m.id, m]));
    const missing = [...new Set(messages.map((m) => m.replyTo).filter((id): id is string => id !== null && !known.has(id)))];
    for (const quoted of missing.length > 0 ? await this.feed.byIds(missing) : []) known.set(quoted.id, quoted);

    const userIds = [...new Set([...known.values()].map((m) => m.userId).filter((id): id is string => id !== null))];
    const authors = userIds.length > 0 ? await this.authors.describe(userIds) : new Map<string, ChatAuthor>();
    const authorOf = (m: ChatMessage) => (m.userId ? (authors.get(m.userId) ?? REMOVED_AUTHOR) : REMOVED_AUTHOR);

    return messages.map((m) => {
      const quoted = m.replyTo ? known.get(m.replyTo) : undefined;
      return {
        id: m.id,
        seq: m.seq,
        body: m.body,
        author: authorOf(m),
        isHost: m.isHost,
        replyTo: quoted ? { id: quoted.id, authorName: authorOf(quoted).name, excerpt: excerptOf(quoted.body) } : null,
        createdAt: m.createdAt.toISOString(),
      };
    });
  }
}

/**
 * #188 — Histórico e atualização do chat. Público (visitante lê). Com a live fora do ar, o chat fecha e o
 * histórico some da tela; com o chat desligado ou sem o recurso no plano, idem.
 */
export class GetChatFeed {
  constructor(
    private readonly rooms: ChatRoomReader,
    private readonly feed: ChatFeedReader,
    private readonly entitled: ChatEntitlement,
    private readonly presenter: ChatMessagePresenter,
  ) {}

  async execute(input: { streamId: string; version?: string }): Promise<Result<ChatFeedView, DomainError>> {
    const room = await this.rooms.room(input.streamId);
    if (!room) return err(new NotFoundError("Transmissão"));
    const reason: ChatClosedReason | null = !(await this.entitled(room.ownerId)) ? "unavailable" : !room.chatEnabled ? "disabled" : room.status !== "live" ? "not_live" : null;
    if (reason) return ok({ open: false, reason, version: `closed:${reason}`, messages: [] });

    const version = await this.feed.version(room.streamId);
    if (version === input.version) return ok({ open: true, reason: null, version, messages: null });
    return ok({ open: true, reason: null, version, messages: await this.presenter.present(await this.feed.latest(room.streamId, CHAT_LIMITS.history)) });
  }
}
