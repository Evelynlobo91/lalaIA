import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresChatModeration } from "./postgres-chat-moderation";
import { PostgresChatRepository } from "./postgres-chat-repository";

const db = sql();
const moderation = new PostgresChatModeration(db);
const chat = new PostgresChatRepository(db);
const ana = crypto.randomUUID(); // parceira, anfitriã
const bia = crypto.randomUUID(); // outra parceira
const mod = crypto.randomUUID(); // moderação da plataforma
const leo = crypto.randomUUID(); // espectador
const rui = crypto.randomUUID(); // outro espectador
let stream: string;
let second: string;
let biaStream: string;

const newStream = async (owner: string) =>
  (
    await db<{ id: string }[]>`
      insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
      values (${owner}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, 'live') returning id`
  )[0].id;
const say = async (userId: string, streamId: string, body: string, isHost = false) => (await chat.insert(userId, { streamId, body, isHost, replyTo: null }))!;

beforeAll(async () => {
  for (const id of [ana, bia, mod, leo, rui]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`mod-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner'), (${mod}, 'moderator')`;
  stream = await newStream(ana);
  second = await newStream(ana);
  biaStream = await newStream(bia);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${mod}, ${leo}, ${rui})`;
  await db.end();
});

describe("PostgresChatModeration (#192)", () => {
  it("apagar: anfitriã, moderação e o autor; outra pessoa (ou outra parceira) não (RLS)", async () => {
    const a = await say(leo, stream, "primeira");
    const b = await say(leo, stream, "segunda");
    const c = await say(leo, stream, "terceira");
    expect(await moderation.remove(rui, a.id)).toBe(false);
    expect(await moderation.remove(bia, a.id)).toBe(false);
    expect(await moderation.remove(ana, a.id)).toBe(true);
    expect(await moderation.remove(ana, a.id)).toBe(false);
    expect(await moderation.remove(mod, b.id)).toBe(true);
    expect(await moderation.remove(leo, c.id)).toBe(true);
    expect(await chat.latest(stream, 50)).toEqual([]);
    expect(await moderation.find(a.id)).toMatchObject({ deleted: true, userId: leo, streamId: stream });
    expect(await moderation.find(crypto.randomUUID())).toBeNull();
    // Apagada não volta, nem pela anfitriã.
    await expect(asUser(ana, (tx) => tx`update live.chat_messages set deleted_at = null where id = ${a.id}`, db)).rejects.toThrow(/não volta/);
  });

  it("fixar: uma por transmissão, só quem modera; a fixada aparece no histórico e muda a versão", async () => {
    const first = await say(ana, stream, "Happy hour até 20h", true);
    const other = await say(leo, stream, "boa!");
    const before = await chat.version(stream);
    expect(await moderation.setPinned(leo, stream, other.id, true)).toBe(false);
    expect(await moderation.setPinned(bia, stream, first.id, true)).toBe(false);
    expect(await chat.pinned(stream)).toBeNull();

    expect(await moderation.setPinned(ana, stream, first.id, true)).toBe(true);
    expect((await chat.pinned(stream))?.id).toBe(first.id);
    expect(await chat.version(stream)).not.toBe(before);
    expect(await moderation.setPinned(mod, stream, other.id, true)).toBe(true);
    expect((await chat.pinned(stream))?.id).toBe(other.id);
    expect(await moderation.setPinned(ana, stream, other.id, false)).toBe(true);
    expect(await chat.pinned(stream)).toBeNull();

    // Fixada apagada some do topo.
    await moderation.setPinned(ana, stream, other.id, true);
    await moderation.remove(ana, other.id);
    expect(await chat.pinned(stream)).toBeNull();
  });

  it("silenciar: vale na transmissão, pelo prazo; silenciado não envia (RLS) e a restrição some quando vence", async () => {
    await moderation.mute(ana, { ownerId: ana, streamId: stream, userId: leo, expiresAt: new Date(Date.now() + 5 * 60_000) });
    expect(await chat.blocked(stream, leo)).toMatchObject({ kind: "mute" });
    expect(await chat.blocked(second, leo)).toBeNull();
    expect(await chat.insert(leo, { streamId: stream, body: "posso?", isHost: false, replyTo: null })).toBeNull();
    expect(await say(leo, second, "aqui eu posso")).toMatchObject({ body: "aqui eu posso" });

    // Silenciar de novo troca o prazo (não duplica); vencido, volta a enviar.
    await moderation.mute(ana, { ownerId: ana, streamId: stream, userId: leo, expiresAt: null });
    expect(await chat.blocked(stream, leo)).toEqual({ kind: "mute", until: null });
    expect((await moderation.listActive(ana, ana)).filter((r) => r.userId === leo)).toHaveLength(1);
    await db`update live.chat_restrictions set expires_at = now() - interval '1 second' where user_id = ${leo}`;
    expect(await chat.blocked(stream, leo)).toBeNull();
    expect(await moderation.listActive(ana, ana)).toEqual([]);
    expect(await say(leo, stream, "voltei")).toMatchObject({ body: "voltei" });
  });

  it("banir: vale em todos os chats do parceiro, e só neles; só o dono do chat ou a moderação restringem", async () => {
    await moderation.ban(ana, { ownerId: ana, userId: rui });
    await moderation.ban(ana, { ownerId: ana, userId: rui });
    expect(await chat.blocked(stream, rui)).toEqual({ kind: "ban", until: null });
    expect(await chat.blocked(second, rui)).toEqual({ kind: "ban", until: null });
    expect(await chat.blocked(biaStream, rui)).toBeNull();
    expect(await chat.insert(rui, { streamId: second, body: "oi", isHost: false, replyTo: null })).toBeNull();
    expect(await say(rui, biaStream, "na Bia eu posso")).not.toBeNull();

    // Outra parceira não bane no chat da Ana nem silencia em transmissão alheia; o espectador não bane ninguém.
    await expect(moderation.ban(bia, { ownerId: ana, userId: leo })).rejects.toThrow(/row-level security/);
    await expect(moderation.mute(bia, { ownerId: bia, streamId: stream, userId: leo, expiresAt: null })).rejects.toThrow(/row-level security/);
    await expect(moderation.ban(leo, { ownerId: ana, userId: rui })).rejects.toThrow(/row-level security/);
    await moderation.mute(mod, { ownerId: ana, streamId: stream, userId: leo, expiresAt: null });
    expect(await chat.blocked(stream, leo)).toMatchObject({ kind: "mute" });
  });

  it("quem foi restringido não lê as restrições; só o dono do chat retira", async () => {
    expect(await asUser(rui, (tx) => tx`select id from live.chat_restrictions`, db)).toHaveLength(0);
    const mine = await moderation.listActive(ana, ana);
    expect(mine.map((r) => r.kind).sort()).toEqual(["ban", "mute"]);
    expect(await moderation.listActive(bia, ana)).toEqual([]);
    const ban = mine.find((r) => r.kind === "ban")!;
    expect(await moderation.lift(rui, ban.id)).toBe(false);
    expect(await moderation.lift(bia, ban.id)).toBe(false);
    expect(await moderation.lift(ana, ban.id)).toBe(true);
    expect(await chat.blocked(stream, rui)).toBeNull();
  });

  it("opções do chat: só o dono muda; modo lento só nos valores permitidos", async () => {
    expect(await moderation.saveSettings(bia, stream, { chatEnabled: false, slowSeconds: 10 })).toBe(false);
    expect(await moderation.saveSettings(leo, stream, { chatEnabled: false, slowSeconds: 10 })).toBe(false);
    expect(await moderation.saveSettings(ana, stream, { chatEnabled: false, slowSeconds: 30 })).toBe(true);
    expect(await chat.room(stream)).toMatchObject({ chatEnabled: false, slowSeconds: 30 });
    await expect(moderation.saveSettings(ana, stream, { chatEnabled: true, slowSeconds: 7 })).rejects.toThrow(/check/);
    expect(await moderation.saveSettings(ana, stream, { chatEnabled: true, slowSeconds: 0 })).toBe(true);
  });
});
