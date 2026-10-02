import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { MessageLikeStore } from "../features/like-chat-message/like-chat-message.use-case";
import type { PresenceStore } from "../features/live-presence/live-presence.use-case";
import { NO_REACTIONS, REACTION_KINDS, type LiveReactionStore, type ReactionKind, type ReactionTotals } from "../features/react-to-live/react-to-live.use-case";

const RLS_VIOLATION = "42501";
const refusedByRls = (error: unknown) => (error as { code?: string }).code === RLS_VIOLATION;

export class PostgresReactionRepository implements LiveReactionStore, MessageLikeStore, PresenceStore {
  constructor(private readonly sql: Sql) {}

  async toggleLike(userId: string, streamId: string): Promise<{ liked: boolean } | null> {
    try {
      return await asUser(
        userId,
        async (tx) => {
          const removed = await tx`delete from live.stream_likes where stream_id = ${streamId} and user_id = ${userId} returning 1`;
          if (removed.length > 0) return { liked: false };
          await tx`insert into live.stream_likes (stream_id, user_id) values (${streamId}, ${userId}) on conflict do nothing`;
          return { liked: true };
        },
        this.sql,
      );
    } catch (error) {
      // RLS: a live saiu do ar entre a checagem e a gravação.
      if (refusedByRls(error)) return null;
      throw error;
    }
  }

  async likes(streamId: string): Promise<number> {
    const [row] = await this.sql<{ total: number }[]>`select count(*)::int as total from live.stream_likes where stream_id = ${streamId}`;
    return row.total;
  }

  // Sistema: os contadores não são de ninguém; o lote já chega validado e limitado pelo caso de uso.
  async addReactions(streamId: string, counts: Partial<ReactionTotals>): Promise<ReactionTotals> {
    const rows = (Object.entries(counts) as Array<[ReactionKind, number]>).filter(([, n]) => n > 0).map(([kind, total]) => ({ stream_id: streamId, kind, total }));
    if (rows.length > 0) {
      await this.sql`
        insert into live.reaction_counters ${this.sql(rows, "stream_id", "kind", "total")}
        on conflict (stream_id, kind) do update set total = live.reaction_counters.total + excluded.total`;
    }
    return this.reactionTotals(streamId);
  }

  async reactionTotals(streamId: string): Promise<ReactionTotals> {
    const rows = await this.sql<{ kind: ReactionKind; total: string }[]>`select kind, total from live.reaction_counters where stream_id = ${streamId}`;
    const totals = { ...NO_REACTIONS };
    for (const r of rows) if (REACTION_KINDS.includes(r.kind)) totals[r.kind] = Number(r.total);
    return totals;
  }

  async toggle(userId: string, messageId: string): Promise<{ liked: boolean; likes: number } | null> {
    try {
      const liked = await asUser(
        userId,
        async (tx) => {
          const removed = await tx`delete from live.chat_message_likes where message_id = ${messageId} and user_id = ${userId} returning 1`;
          if (removed.length > 0) return false;
          await tx`insert into live.chat_message_likes (message_id, user_id) values (${messageId}, ${userId}) on conflict do nothing`;
          return true;
        },
        this.sql,
      );
      const [row] = await this.sql<{ total: number }[]>`select count(*)::int as total from live.chat_message_likes where message_id = ${messageId}`;
      return { liked, likes: row.total };
    } catch (error) {
      // RLS: mensagem apagada, de chat fechado ou inexistente.
      if (refusedByRls(error) || (error as { code?: string }).code === "23503") return null;
      throw error;
    }
  }

  async mine(userId: string, streamId: string): Promise<{ messageIds: string[]; likedLive: boolean }> {
    return asUser(
      userId,
      async (tx) => {
        const messages = await tx<{ message_id: string }[]>`
          select l.message_id from live.chat_message_likes l
          where l.user_id = ${userId} and live.chat_message_in_stream(l.message_id, ${streamId})`;
        const live = await tx`select 1 from live.stream_likes where stream_id = ${streamId} and user_id = ${userId}`;
        return { messageIds: messages.map((m) => m.message_id), likedLive: live.length > 0 };
      },
      this.sql,
    );
  }

  // Sistema: presença efêmera, sem relação com a conta. Aproveita o batimento para limpar os antigos da transmissão.
  async beat(streamId: string, viewerId: string, windowSeconds: number): Promise<number> {
    const [row] = await this.sql<{ viewers: number }[]>`
      with beat as (
        insert into live.viewers (stream_id, viewer_id) values (${streamId}, ${viewerId})
        on conflict (stream_id, viewer_id) do update set seen_at = now()
        returning viewer_id
      ), swept as (
        delete from live.viewers where stream_id = ${streamId} and seen_at < now() - make_interval(secs => ${windowSeconds * 4}) and viewer_id <> ${viewerId}
      )
      select (
        select count(*) from live.viewers v
        where v.stream_id = ${streamId} and v.seen_at >= now() - make_interval(secs => ${windowSeconds}) and v.viewer_id <> ${viewerId}
      )::int + (select count(*) from beat)::int as viewers`;
    return row.viewers;
  }

  async viewersNow(streamIds: string[], windowSeconds: number): Promise<Record<string, number>> {
    if (streamIds.length === 0) return {};
    const rows = await this.sql<{ stream_id: string; viewers: number }[]>`
      select stream_id, count(*)::int as viewers from live.viewers
      where stream_id in ${this.sql(streamIds)} and seen_at >= now() - make_interval(secs => ${windowSeconds})
      group by stream_id`;
    return Object.fromEntries(rows.map((r) => [r.stream_id, r.viewers]));
  }
}
