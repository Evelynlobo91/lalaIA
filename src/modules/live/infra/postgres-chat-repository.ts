import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { ChatMessage, ChatRoom } from "../domain/chat";
import type { ChatFeedReader } from "../features/chat-feed/chat-feed.use-case";
import type { ChatMessageWriter, ChatRateLimiter, ChatRestrictionReader, ChatRoomReader } from "../features/send-chat-message/send-chat-message.use-case";

type Row = { id: string; seq: string; stream_id: string; user_id: string | null; body: string; is_host: boolean; reply_to: string | null; likes: number; created_at: Date };

const LIKES = "(select count(*) from live.chat_message_likes l where l.message_id = live.chat_messages.id)::int as likes";
const COLUMNS = `id, seq, stream_id, user_id, body, is_host, reply_to, ${LIKES}, created_at`;
// Mensagem recém-gravada: ainda sem curtidas (e quem envia não lê as curtidas dos outros sob RLS).
const NEW_COLUMNS = "id, seq, stream_id, user_id, body, is_host, reply_to, 0 as likes, created_at";
const toMessage = (r: Row): ChatMessage => ({ id: r.id, seq: Number(r.seq), streamId: r.stream_id, userId: r.user_id, body: r.body, isHost: r.is_host, replyTo: r.reply_to, likes: r.likes, createdAt: r.created_at });

const RLS_VIOLATION = "42501";

export class PostgresChatRepository implements ChatRoomReader, ChatMessageWriter, ChatRateLimiter, ChatFeedReader, ChatRestrictionReader {
  constructor(private readonly sql: Sql) {}

  // Sistema (sem asUser): quem conversa não lê live.streams. Transmissão de parceiro suspenso não existe (#144).
  async room(streamId: string): Promise<ChatRoom | null> {
    const [row] = await this.sql<{ id: string; owner_id: string; status: ChatRoom["status"]; chat_enabled: boolean; chat_slow_seconds: number }[]>`
      select id, owner_id, status, chat_enabled, chat_slow_seconds from live.streams where id = ${streamId} and not platform.owner_suspended(owner_id)`;
    return row ? { streamId: row.id, ownerId: row.owner_id, status: row.status, chatEnabled: row.chat_enabled, slowSeconds: row.chat_slow_seconds } : null;
  }

  async insert(userId: string, message: { streamId: string; body: string; isHost: boolean; replyTo: string | null }): Promise<ChatMessage | null> {
    try {
      const [row] = await asUser(
        userId,
        (tx) =>
          tx.unsafe<Row[]>(`insert into live.chat_messages (stream_id, user_id, body, is_host, reply_to) values ($1, $2, $3, $4, $5) returning ${NEW_COLUMNS}`, [
            message.streamId,
            userId,
            message.body,
            message.isHost,
            message.replyTo,
          ]),
        this.sql,
      );
      return toMessage(row);
    } catch (error) {
      // RLS: o chat fechou (live saiu do ar, chat desligado) entre a checagem e a gravação.
      if ((error as { code?: string }).code === RLS_VIOLATION) return null;
      throw error;
    }
  }

  async findVisible(streamId: string, messageId: string): Promise<ChatMessage | null> {
    const [row] = await this.sql.unsafe<Row[]>(`select ${COLUMNS} from live.chat_messages where id = $1 and stream_id = $2 and deleted_at is null`, [messageId, streamId]);
    return row ? toMessage(row) : null;
  }

  async lastMessageAt(streamId: string, userId: string): Promise<Date | null> {
    const [row] = await this.sql<{ created_at: Date }[]>`
      select created_at from live.chat_messages where stream_id = ${streamId} and user_id = ${userId} order by created_at desc limit 1`;
    return row?.created_at ?? null;
  }

  // Sistema: silêncio (na transmissão) ou banimento (nos chats do parceiro) que ainda vale. O banimento vem primeiro.
  async blocked(streamId: string, userId: string): Promise<{ kind: "mute" | "ban"; until: Date | null } | null> {
    const [row] = await this.sql<{ kind: "mute" | "ban"; expires_at: Date | null }[]>`
      select r.kind, r.expires_at
      from live.streams s join live.chat_restrictions r on r.owner_id = s.owner_id
      where s.id = ${streamId} and r.user_id = ${userId}
        and (r.stream_id is null or r.stream_id = s.id) and (r.expires_at is null or r.expires_at > now())
      order by (r.kind = 'ban') desc, r.expires_at desc nulls first limit 1`;
    return row ? { kind: row.kind, until: row.expires_at } : null;
  }

  /** O que a pessoa escreveu nos chats (exportação LGPD). Como a própria pessoa: a RLS só mostra as dela. */
  async writtenBy(userId: string): Promise<Array<{ body: string; createdAt: Date; deleted: boolean }>> {
    const rows = await asUser(
      userId,
      (tx) => tx<{ body: string; created_at: Date; deleted_at: Date | null }[]>`
        select body, created_at, deleted_at from live.chat_messages where user_id = ${userId} order by created_at desc limit 5000`,
      this.sql,
    );
    return rows.map((r) => ({ body: r.body, createdAt: r.created_at, deleted: r.deleted_at !== null }));
  }

  async pinned(streamId: string): Promise<ChatMessage | null> {
    const [row] = await this.sql.unsafe<Row[]>(`select ${COLUMNS} from live.chat_messages where stream_id = $1 and pinned_at is not null and deleted_at is null`, [streamId]);
    return row ? toMessage(row) : null;
  }

  // A versão muda quando entra uma mensagem (última seq), quando uma some (quantas foram apagadas), quando
  // uma curtida entra ou sai (quantas curtidas as mensagens visíveis têm) ou quando a fixada muda.
  async version(streamId: string): Promise<string> {
    const [row] = await this.sql<{ last: string; deleted: number; likes: number; pinned: string }[]>`
      select coalesce(max(m.seq), 0) as last, count(*) filter (where m.deleted_at is not null)::int as deleted,
             (select count(*) from live.chat_message_likes l join live.chat_messages lm on lm.id = l.message_id
               where lm.stream_id = ${streamId} and lm.deleted_at is null)::int as likes,
             coalesce(max(m.seq) filter (where m.pinned_at is not null and m.deleted_at is null), 0) as pinned
      from live.chat_messages m where m.stream_id = ${streamId}`;
    return `${row.last}:${row.deleted}:${row.likes}:${row.pinned}`;
  }

  async latest(streamId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await this.sql.unsafe<Row[]>(`select ${COLUMNS} from live.chat_messages where stream_id = $1 and deleted_at is null order by seq desc limit $2`, [streamId, limit]);
    return rows.map(toMessage).reverse();
  }

  async byIds(ids: string[]): Promise<ChatMessage[]> {
    if (ids.length === 0) return [];
    const rows = await this.sql<Row[]>`
      select id, seq, stream_id, user_id, body, is_host, reply_to, 0 as likes, created_at from live.chat_messages where id in ${this.sql(ids)} and deleted_at is null`;
    return rows.map(toMessage);
  }
}
