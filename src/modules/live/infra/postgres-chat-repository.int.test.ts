import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { ModuleChatAuthors } from "./chat-authors";
import { PostgresChatRepository } from "./postgres-chat-repository";

const db = sql();
const repo = new PostgresChatRepository(db);
const ana = crypto.randomUUID(); // parceira, dona da transmissão
const leo = crypto.randomUUID(); // espectador
const bia = crypto.randomUUID(); // outra espectadora
let stream: string;
let otherStream: string;

const newStream = async (owner: string, signal: "live" | "offline" = "live") =>
  (
    await db<{ id: string }[]>`
      insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
      values (${owner}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, ${signal}) returning id`
  )[0].id;

beforeAll(async () => {
  for (const [id, name] of [
    [ana, "Bar da Ana"],
    [leo, "Leo"],
    [bia, "Bia"],
  ] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`chat-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09", display_name: name })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner')`;
  stream = await newStream(ana);
  otherStream = await newStream(ana);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${leo}, ${bia})`;
  await db.end();
});

describe("PostgresChatRepository (#187, #188)", () => {
  it("sala do chat: dono, status e se o chat está ligado; transmissão inexistente → null", async () => {
    expect(await repo.room(stream)).toEqual({ streamId: stream, ownerId: ana, status: "live", chatEnabled: true, slowSeconds: 0 });
    expect(await repo.room(crypto.randomUUID())).toBeNull();
  });

  it("espectador envia; a versão muda; o histórico vem da mais antiga para a mais nova", async () => {
    expect(await repo.version(stream)).toBe("0:0:0:0");
    const first = await repo.insert(leo, { streamId: stream, body: "Que som bom!", isHost: false, replyTo: null });
    const second = await repo.insert(ana, { streamId: stream, body: "Bem-vindos!", isHost: true, replyTo: first!.id });
    expect(first).toMatchObject({ userId: leo, body: "Que som bom!", isHost: false, replyTo: null });
    expect(second).toMatchObject({ userId: ana, isHost: true, replyTo: first!.id });
    expect(second!.seq).toBeGreaterThan(first!.seq);
    expect(await repo.version(stream)).toBe(`${second!.seq}:0:0:0`);
    expect((await repo.latest(stream, 50)).map((m) => m.body)).toEqual(["Que som bom!", "Bem-vindos!"]);
    expect((await repo.latest(stream, 1)).map((m) => m.body)).toEqual(["Bem-vindos!"]);
    expect(await repo.lastMessageAt(stream, leo)).toBeInstanceOf(Date);
    expect(await repo.lastMessageAt(stream, bia)).toBeNull();
    expect(await repo.lastMessageAt(otherStream, leo)).toBeNull();
  });

  it("ninguém escreve em nome de outra pessoa, e o selo de anfitrião é só do dono (RLS)", async () => {
    await expect(
      asUser(leo, (tx) => tx`insert into live.chat_messages (stream_id, user_id, body) values (${stream}, ${bia}, 'em nome da Bia')`, db),
    ).rejects.toThrow(/row-level security/);
    expect(await repo.insert(leo, { streamId: stream, body: "sou o dono", isHost: true, replyTo: null })).toBeNull();
    expect(await repo.insert(ana, { streamId: stream, body: "sem selo", isHost: false, replyTo: null })).toBeNull();
  });

  it("resposta só a mensagem da mesma transmissão (RLS)", async () => {
    const [first] = await repo.latest(stream, 50);
    expect(await repo.insert(bia, { streamId: otherStream, body: "resposta cruzada", isHost: false, replyTo: first.id })).toBeNull();
    expect(await repo.findVisible(otherStream, first.id)).toBeNull();
    expect(await repo.findVisible(stream, first.id)).toMatchObject({ id: first.id });
  });

  it("chat fechado no banco: live fora do ar, pausada ou com o chat desligado", async () => {
    const offline = await newStream(ana, "offline");
    expect(await repo.insert(leo, { streamId: offline, body: "tem alguém?", isHost: false, replyTo: null })).toBeNull();

    await db`update live.streams set control = 'paused' where id = ${otherStream}`;
    expect(await repo.insert(leo, { streamId: otherStream, body: "pausou?", isHost: false, replyTo: null })).toBeNull();
    await db`update live.streams set control = 'on', chat_enabled = false where id = ${otherStream}`;
    expect(await repo.insert(leo, { streamId: otherStream, body: "desligou?", isHost: false, replyTo: null })).toBeNull();
    expect(await repo.room(otherStream)).toMatchObject({ status: "live", chatEnabled: false });
    await db`update live.streams set chat_enabled = true where id = ${otherStream}`;
    expect(await repo.insert(leo, { streamId: otherStream, body: "voltou!", isHost: false, replyTo: null })).not.toBeNull();
  });

  it("o público não lê a tabela: cada pessoa só enxerga as próprias mensagens", async () => {
    expect(await asUser(bia, (tx) => tx`select id from live.chat_messages where stream_id = ${stream}`, db)).toHaveLength(0);
    expect(await asUser(leo, (tx) => tx`select id from live.chat_messages where stream_id = ${stream}`, db)).toHaveLength(1);
    await expect(asUser(leo, (tx) => tx`update live.chat_messages set body = 'editada' where stream_id = ${stream}`, db)).rejects.toThrow(/permission denied/);
  });

  it("mensagem apagada some do histórico e da citação, e a versão muda", async () => {
    const [first, second] = await repo.latest(stream, 50);
    await db`update live.chat_messages set deleted_at = now() where id = ${first.id}`;
    expect((await repo.latest(stream, 50)).map((m) => m.id)).toEqual([second.id]);
    expect(await repo.byIds([first.id, second.id])).toHaveLength(1);
    expect(await repo.version(stream)).toBe(`${second.seq}:1:0:0`);
  });

  it("autores: nome, nível e nunca o e-mail; conta excluída fica sem autor", async () => {
    const authors = await new ModuleChatAuthors().describe([ana, leo, crypto.randomUUID()]);
    expect(authors.get(leo)).toEqual({ name: "Leo", avatarUrl: null, level: 1 });
    expect(authors.get(ana)?.name).toBe("Bar da Ana");
    expect(authors.size).toBe(2);
    expect(JSON.stringify([...authors.values()])).not.toContain("@lalaia.test");

    const sent = await repo.insert(bia, { streamId: stream, body: "tchau", isHost: false, replyTo: null });
    await db`delete from auth.users where id = ${bia}`;
    expect((await repo.latest(stream, 50)).find((m) => m.id === sent!.id)).toMatchObject({ userId: null, body: "tchau" });
  });
});
