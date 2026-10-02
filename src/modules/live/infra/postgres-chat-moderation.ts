import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { ChatMessage } from "../domain/chat";
import type { ChatModerationStore, ChatRestriction } from "../features/moderate-chat/moderate-chat.use-case";

type MessageRow = { id: string; seq: string; stream_id: string; user_id: string | null; body: string; is_host: boolean; reply_to: string | null; created_at: Date; deleted_at: Date | null };
type RestrictionRow = { id: string; user_id: string; kind: "mute" | "ban"; stream_id: string | null; expires_at: Date | null; created_at: Date };

const RLS_VIOLATION = "42501";
const refused = (error: unknown) => (error as { code?: string }).code === RLS_VIOLATION;

export class PostgresChatModeration implements ChatModerationStore {
  constructor(private readonly sql: Sql) {}

  // Sistema: só para decidir a ação (quem escreveu, de que transmissão). Nada disso vai para a tela.
  async find(messageId: string): Promise<(ChatMessage & { deleted: boolean }) | null> {
    const [r] = await this.sql<MessageRow[]>`
      select id, seq, stream_id, user_id, body, is_host, reply_to, created_at, deleted_at from live.chat_messages where id = ${messageId}`;
    return r ? { id: r.id, seq: Number(r.seq), streamId: r.stream_id, userId: r.user_id, body: r.body, isHost: r.is_host, replyTo: r.reply_to, likes: 0, createdAt: r.created_at, deleted: r.deleted_at !== null } : null;
  }

  async remove(actorId: string, messageId: string): Promise<boolean> {
    try {
      const rows = await asUser(
        actorId,
        (tx) => tx`update live.chat_messages set deleted_at = now(), deleted_by = ${actorId}, pinned_at = null where id = ${messageId} and deleted_at is null returning id`,
        this.sql,
      );
      return rows.length > 0;
    } catch (error) {
      // O autor apagando a própria mensagem fixada: o gatilho recusa mexer no "fixada". Apaga sem tocar nela.
      if (!refused(error)) throw error;
      const rows = await asUser(actorId, (tx) => tx`update live.chat_messages set deleted_at = now(), deleted_by = ${actorId} where id = ${messageId} and deleted_at is null returning id`, this.sql);
      return rows.length > 0;
    }
  }

  async setPinned(actorId: string, streamId: string, messageId: string, pinned: boolean): Promise<boolean> {
    try {
      return await asUser(
        actorId,
        async (tx) => {
          // Uma fixada por transmissão: a anterior sai antes de a nova entrar.
          await tx`update live.chat_messages set pinned_at = null where stream_id = ${streamId} and pinned_at is not null`;
          if (!pinned) return true;
          const rows = await tx`update live.chat_messages set pinned_at = now() where id = ${messageId} and stream_id = ${streamId} and deleted_at is null returning id`;
          return rows.length > 0;
        },
        this.sql,
      );
    } catch (error) {
      if (refused(error)) return false;
      throw error;
    }
  }

  async mute(actorId: string, r: { ownerId: string; streamId: string; userId: string; expiresAt: Date | null }): Promise<void> {
    await asUser(
      actorId,
      (tx) => tx`
        insert into live.chat_restrictions (owner_id, user_id, kind, stream_id, expires_at, created_by)
        values (${r.ownerId}, ${r.userId}, 'mute', ${r.streamId}, ${r.expiresAt}, ${actorId})
        on conflict (stream_id, user_id) where kind = 'mute' do update set expires_at = excluded.expires_at, created_by = excluded.created_by`,
      this.sql,
    );
  }

  async ban(actorId: string, r: { ownerId: string; userId: string }): Promise<void> {
    await asUser(
      actorId,
      (tx) => tx`
        insert into live.chat_restrictions (owner_id, user_id, kind, created_by) values (${r.ownerId}, ${r.userId}, 'ban', ${actorId})
        on conflict (owner_id, user_id) where kind = 'ban' do nothing`,
      this.sql,
    );
  }

  async listActive(actorId: string, ownerId: string): Promise<ChatRestriction[]> {
    const rows = await asUser(
      actorId,
      (tx) => tx<RestrictionRow[]>`
        select r.id, r.user_id, r.kind, r.stream_id, r.expires_at, r.created_at
        from live.chat_restrictions r
        where r.owner_id = ${ownerId} and (r.expires_at is null or r.expires_at > now())
          -- Silêncio "a live toda" só vale enquanto a transmissão não foi encerrada.
          and (r.stream_id is null or exists (select 1 from live.streams s where s.id = r.stream_id and s.status <> 'ended'))
        order by r.created_at desc limit 100`,
      this.sql,
    );
    return rows.map((r) => ({ id: r.id, userId: r.user_id, kind: r.kind, streamId: r.stream_id, expiresAt: r.expires_at, createdAt: r.created_at }));
  }

  async lift(actorId: string, restrictionId: string): Promise<boolean> {
    const rows = await asUser(actorId, (tx) => tx`delete from live.chat_restrictions where id = ${restrictionId} returning id`, this.sql);
    return rows.length > 0;
  }

  async saveSettings(actorId: string, streamId: string, settings: { chatEnabled: boolean; slowSeconds: number }): Promise<boolean> {
    const rows = await asUser(
      actorId,
      (tx) => tx`update live.streams set chat_enabled = ${settings.chatEnabled}, chat_slow_seconds = ${settings.slowSeconds} where id = ${streamId} returning id`,
      this.sql,
    );
    return rows.length > 0;
  }
}
