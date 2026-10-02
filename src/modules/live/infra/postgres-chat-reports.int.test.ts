import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresChatModeration } from "./postgres-chat-moderation";
import { PostgresChatReports } from "./postgres-chat-reports";
import { PostgresChatRepository } from "./postgres-chat-repository";

const db = sql();
const reports = new PostgresChatReports(db);
const chat = new PostgresChatRepository(db);
const moderation = new PostgresChatModeration(db);
const ana = crypto.randomUUID(); // anfitriã
const mod = crypto.randomUUID(); // moderação
const leo = crypto.randomUUID();
const bia = crypto.randomUUID();
const rui = crypto.randomUUID(); // quem escreve as mensagens denunciadas
let stream: string;
const say = async (userId: string, body: string) => (await chat.insert(userId, { streamId: stream, body, isHost: false, replyTo: null }))!;

beforeAll(async () => {
  for (const id of [ana, mod, leo, bia, rui]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`rep-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${mod}, 'moderator')`;
  [{ id: stream }] = await db<{ id: string }[]>`
    insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
    values (${ana}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, 'live') returning id`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${mod}, ${leo}, ${bia}, ${rui})`;
  await db.end();
});

describe("PostgresChatReports (#193)", () => {
  it("denuncia mensagem visível de outra pessoa, uma vez por pessoa; a própria ou apagada, não", async () => {
    const message = await say(rui, "mensagem ofensiva");
    expect(await reports.report(leo, message.id, "ofensa")).toBe("created");
    expect(await reports.report(leo, message.id, "spam")).toBe("duplicate");
    expect(await reports.report(bia, message.id, "spam")).toBe("created");
    expect(await reports.report(rui, message.id, "outro")).toBe("unavailable");
    expect(await reports.report(leo, crypto.randomUUID(), "outro")).toBe("unavailable");

    const gone = await say(rui, "já apagada");
    await moderation.remove(ana, gone.id);
    expect(await reports.report(leo, gone.id, "ofensa")).toBe("unavailable");
    await expect(asUser(leo, (tx) => tx`insert into live.chat_reports (message_id, reporter_id, reason) values (${message.id}, ${bia}, 'outro')`, db)).rejects.toThrow(/row-level security|duplicate/);
  });

  it("só a moderação lê a fila; quem denunciou vê só a própria denúncia; a anfitriã não vê", async () => {
    const queue = await reports.listOpen(mod, 50);
    const mine = queue.find((r) => r.body === "mensagem ofensiva")!;
    expect(mine).toMatchObject({ authorId: rui, reports: 2, reasons: ["ofensa", "spam"], entityType: "place" });
    expect(await reports.listOpen(leo, 50).then((q) => q.map((r) => [r.body, r.reports]))).toEqual([["mensagem ofensiva", 1]]);
    expect((await reports.listOpen(ana, 50)).some((r) => r.body === "mensagem ofensiva")).toBe(false);
    expect((await reports.listOpen(rui, 50)).length).toBe(0);
  });

  it("só a moderação resolve; resolvida, sai da fila; apagar a mensagem leva as denúncias junto na retenção", async () => {
    const [target] = (await reports.listOpen(mod, 50)).filter((r) => r.body === "mensagem ofensiva");
    expect(await reports.resolve(leo, target.messageId, "kept")).toBe(0);
    expect(await reports.resolve(ana, target.messageId, "removed")).toBe(0);
    expect(await reports.resolve(mod, target.messageId, "kept")).toBe(2);
    expect(await reports.resolve(mod, target.messageId, "kept")).toBe(0);
    expect((await reports.listOpen(mod, 50)).some((r) => r.messageId === target.messageId)).toBe(false);
    const [row] = await db`select status, resolution, resolved_by from live.chat_reports where message_id = ${target.messageId} limit 1`;
    expect(row).toMatchObject({ status: "resolved", resolution: "kept", resolved_by: mod });
  });

  it("retenção: mensagens com mais de 30 dias são apagadas de vez, com curtidas e denúncias; as recentes ficam", async () => {
    const old = await say(rui, "mensagem antiga");
    const recent = await say(leo, "mensagem recente");
    await reports.report(leo, old.id, "spam");
    await db`insert into live.chat_message_likes (message_id, user_id) values (${old.id}, ${bia})`;
    await db`update live.chat_messages set created_at = now() - interval '31 days' where id = ${old.id}`;

    const [{ purged }] = await db<{ purged: number }[]>`select live.purge_old_chat_messages() as purged`;
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await db`select 1 from live.chat_messages where id = ${old.id}`).toHaveLength(0);
    expect(await db`select 1 from live.chat_reports where message_id = ${old.id}`).toHaveLength(0);
    expect(await db`select 1 from live.chat_message_likes where message_id = ${old.id}`).toHaveLength(0);
    expect(await db`select 1 from live.chat_messages where id = ${recent.id}`).toHaveLength(1);
    // Ninguém chama a limpeza como usuário, e ela está agendada.
    await expect(asUser(leo, (tx) => tx`select live.purge_old_chat_messages()`, db)).rejects.toThrow(/permission denied/);
    expect(await db`select 1 from cron.job where jobname = 'live-chat-retention'`).toHaveLength(1);
  });

  it("exportação LGPD: a pessoa recebe o que escreveu (inclusive o que foi apagado), e só o dela", async () => {
    const mine = await chat.writtenBy(rui);
    expect(mine.map((m) => [m.body, m.deleted])).toEqual(
      expect.arrayContaining([
        ["mensagem ofensiva", false],
        ["já apagada", true],
      ]),
    );
    expect((await chat.writtenBy(bia)).length).toBe(0);
  });

  it("anfitrião que apagou uma mensagem própria e resolveu denúncias consegue excluir a conta", async () => {
    const host = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${host}, ${`rep-${host}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${host}, 'partner'), (${host}, 'moderator')`;
    const [{ id: own }] = await db<{ id: string }[]>`
      insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
      values (${host}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, 'live') returning id`;
    const mine = (await chat.insert(host, { streamId: own, body: "aviso errado", isHost: true, replyTo: null }))!;
    expect(await moderation.remove(host, mine.id)).toBe(true); // autor = quem apagou
    const other = (await chat.insert(bia, { streamId: own, body: "mensagem da Bia", isHost: false, replyTo: null }))!;
    expect(await reports.report(host, other.id, "spam")).toBe("created"); // denunciante = quem resolve
    expect(await reports.resolve(host, other.id, "kept")).toBe(1);

    await db`delete from auth.users where id = ${host}`;
    expect(await db`select 1 from live.chat_messages where stream_id = ${own}`).toHaveLength(0);
  });

  it("conta excluída: a mensagem fica sem autor e a denúncia fica sem denunciante", async () => {
    const message = await say(rui, "fica sem autor");
    await reports.report(leo, message.id, "outro");
    await db`delete from auth.users where id in (${rui}, ${leo})`;
    const [row] = await db`select user_id from live.chat_messages where id = ${message.id}`;
    expect(row.user_id).toBeNull();
    const queue = await reports.listOpen(mod, 50);
    expect(queue.find((r) => r.messageId === message.id)).toMatchObject({ authorId: null, reports: 1 });
  });
});
