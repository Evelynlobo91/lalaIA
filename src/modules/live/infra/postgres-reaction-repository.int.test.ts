import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { NO_REACTIONS } from "../features/react-to-live/react-to-live.use-case";
import { PostgresChatRepository } from "./postgres-chat-repository";
import { PostgresReactionRepository } from "./postgres-reaction-repository";

const db = sql();
const repo = new PostgresReactionRepository(db);
const chat = new PostgresChatRepository(db);
const ana = crypto.randomUUID(); // dona
const leo = crypto.randomUUID();
const bia = crypto.randomUUID();
const tab = (n: number) => `aba${String(n).padStart(20, "0")}`;
let stream: string;
let offline: string;

const newStream = async (signal: "live" | "offline") =>
  (
    await db<{ id: string }[]>`
      insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
      values (${ana}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, ${signal}) returning id`
  )[0].id;

beforeAll(async () => {
  for (const id of [ana, leo, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`react-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner')`;
  stream = await newStream("live");
  offline = await newStream("offline");
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${leo}, ${bia})`;
  await db.end();
});

describe("PostgresReactionRepository (#189, #190, #191)", () => {
  it("curtir a live: uma por pessoa, alterna, e o total é o mesmo para todos", async () => {
    expect(await repo.toggleLike(leo, stream)).toEqual({ liked: true });
    expect(await repo.toggleLike(bia, stream)).toEqual({ liked: true });
    expect(await repo.likes(stream)).toBe(2);
    expect(await repo.toggleLike(leo, stream)).toEqual({ liked: false });
    expect(await repo.likes(stream)).toBe(1);
    expect(await repo.toggleLike(leo, stream)).toEqual({ liked: true });
  });

  it("não curte live fora do ar nem em nome de outra pessoa (RLS)", async () => {
    expect(await repo.toggleLike(leo, offline)).toBeNull();
    await expect(asUser(leo, (tx) => tx`insert into live.stream_likes (stream_id, user_id) values (${stream}, ${ana})`, db)).rejects.toThrow(/row-level security/);
    expect(await asUser(leo, (tx) => tx`delete from live.stream_likes where user_id = ${bia} returning 1`, db)).toHaveLength(0);
    expect(await repo.likes(stream)).toBe(2);
  });

  it("reações: só totais por tipo, somados lote a lote; ninguém mexe nos contadores como usuário", async () => {
    expect(await repo.reactionTotals(stream)).toEqual(NO_REACTIONS);
    expect(await repo.addReactions(stream, { fire: 3, heart: 1 })).toEqual({ ...NO_REACTIONS, fire: 3, heart: 1 });
    expect(await repo.addReactions(stream, { fire: 2, clap: 0 })).toEqual({ ...NO_REACTIONS, fire: 5, heart: 1 });
    expect(await repo.reactionTotals(offline)).toEqual(NO_REACTIONS);
    await expect(asUser(leo, (tx) => tx`update live.reaction_counters set total = 999999 where stream_id = ${stream}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(leo, (tx) => tx`select * from live.reaction_counters`, db)).rejects.toThrow(/permission denied/);
  });

  it("curtir mensagem: uma por pessoa, aparece no histórico e muda a versão do chat", async () => {
    const message = (await chat.insert(leo, { streamId: stream, body: "Que som bom!", isHost: false, replyTo: null }))!;
    const before = await chat.version(stream);
    expect(await repo.toggle(bia, message.id)).toEqual({ liked: true, likes: 1 });
    expect(await repo.toggle(ana, message.id)).toEqual({ liked: true, likes: 2 });
    expect(await chat.version(stream)).not.toBe(before);
    expect((await chat.latest(stream, 50)).find((m) => m.id === message.id)?.likes).toBe(2);
    expect(await repo.toggle(bia, message.id)).toEqual({ liked: false, likes: 1 });

    expect(await repo.mine(ana, stream)).toEqual({ messageIds: [message.id], likedLive: false });
    expect(await repo.mine(leo, stream)).toEqual({ messageIds: [], likedLive: true });
    expect(await repo.mine(ana, offline)).toEqual({ messageIds: [], likedLive: false });
  });

  it("não curte mensagem apagada, inexistente ou de chat fechado", async () => {
    const [message] = await chat.latest(stream, 50);
    expect(await repo.toggle(bia, crypto.randomUUID())).toBeNull();
    await db`update live.streams set chat_enabled = false where id = ${stream}`;
    expect(await repo.toggle(bia, message.id)).toBeNull();
    await db`update live.streams set chat_enabled = true where id = ${stream}`;
    await db`update live.chat_messages set deleted_at = now() where id = ${message.id}`;
    expect(await repo.toggle(bia, message.id)).toBeNull();
  });

  it("espectadores: cada aba conta uma vez; quem para de bater sai da conta", async () => {
    expect(await repo.beat(stream, tab(1), 15)).toBe(1);
    expect(await repo.beat(stream, tab(2), 15)).toBe(2);
    expect(await repo.beat(stream, tab(1), 15)).toBe(2);
    expect(await repo.viewersNow([stream, offline], 15)).toEqual({ [stream]: 2 });

    await db`update live.viewers set seen_at = now() - interval '20 seconds' where viewer_id = ${tab(2)}`;
    expect(await repo.beat(stream, tab(1), 15)).toBe(1);
    // Batimento muito antigo é varrido no batimento de outra aba.
    await db`update live.viewers set seen_at = now() - interval '5 minutes' where viewer_id = ${tab(2)}`;
    await repo.beat(stream, tab(1), 15);
    expect(await db`select 1 from live.viewers where viewer_id = ${tab(2)}`).toHaveLength(0);
    expect(await repo.viewersNow([], 15)).toEqual({});
  });
});
