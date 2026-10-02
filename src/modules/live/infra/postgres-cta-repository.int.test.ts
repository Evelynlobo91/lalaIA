import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { CtaToSave } from "../features/schedule-cta/schedule-cta.use-case";
import { PostgresCtaRepository } from "./postgres-cta-repository";

const db = sql();
const repo = new PostgresCtaRepository(db);
const ana = crypto.randomUUID(); // parceira, dona
const bia = crypto.randomUUID(); // outra parceira
const adm = crypto.randomUUID(); // admin
const mod = crypto.randomUUID(); // moderação (content:edit, sem ser admin)
let anaStream: string;
let biaStream: string;

const stream = async (owner: string) =>
  (
    await db<{ id: string }[]>`
      insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id)
      values (${owner}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}) returning id`
  )[0].id;

const cta = (streamId: string, patch: Partial<CtaToSave> = {}): CtaToSave => ({
  streamId,
  type: "link",
  refId: null,
  href: "https://instagram.com/bar",
  external: true,
  title: "Siga o bar",
  body: null,
  buttonLabel: "Abrir",
  priority: 2,
  schedule: { kind: "relative", offsetMinutes: 15, durationMinutes: 10 },
  ...patch,
});

beforeAll(async () => {
  for (const id of [ana, bia, adm, mod]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`cta-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner'), (${adm}, 'admin'), (${mod}, 'moderator')`;
  anaStream = await stream(ana);
  biaStream = await stream(bia);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${adm}, ${mod})`;
  await db.end();
});

describe("PostgresCtaRepository (#178)", () => {
  it("dona cria CTAs com cada agendamento e lê de volta, por prioridade", async () => {
    const startsAt = new Date("2026-10-02T23:00:00Z");
    const endsAt = new Date("2026-10-03T00:00:00Z");
    const relative = await repo.create(ana, cta(anaStream));
    const absolute = await repo.create(ana, cta(anaStream, { type: "promocao", refId: crypto.randomUUID(), href: "/lugares/x", external: false, title: "Chope em dobro", body: "Até 21h.", priority: 1, schedule: { kind: "absolute", startsAt, endsAt } }));
    await repo.create(ana, cta(anaStream, { title: "De meia em meia hora", priority: 3, schedule: { kind: "recurring", intervalMinutes: 30, durationMinutes: 5 } }));

    expect(relative).toMatchObject({ streamId: anaStream, ownerId: ana, schedule: { kind: "relative", offsetMinutes: 15, durationMinutes: 10 } });
    expect(absolute).toMatchObject({ type: "promocao", external: false, body: "Até 21h.", schedule: { kind: "absolute", startsAt, endsAt } });
    expect((await repo.listByStream(ana, anaStream)).map((c) => [c.title, c.priority, c.schedule.kind])).toEqual([
      ["Chope em dobro", 1, "absolute"],
      ["Siga o bar", 2, "relative"],
      ["De meia em meia hora", 3, "recurring"],
    ]);
    expect(await repo.find(ana, relative.id)).toMatchObject({ id: relative.id });
    // Leitura do sistema (chamada ativa no player): os mesmos CTAs, sem depender de quem está logado.
    expect((await repo.listForStream(anaStream)).map((c) => c.title)).toEqual(["Chope em dobro", "Siga o bar", "De meia em meia hora"]);
    expect(await repo.listForStream(biaStream)).toEqual([]);
  });

  it("edita trocando o agendamento: as colunas do agendamento anterior são limpas", async () => {
    const [first] = await repo.listByStream(ana, anaStream);
    const updated = await repo.update(ana, first.id, cta(anaStream, { title: "Agora recorrente", schedule: { kind: "recurring", intervalMinutes: 20, durationMinutes: 5 } }));
    expect(updated).toMatchObject({ id: first.id, title: "Agora recorrente", type: "link", schedule: { kind: "recurring", intervalMinutes: 20, durationMinutes: 5 } });
    const [row] = await db`select starts_at, ends_at, offset_minutes from live.ctas where id = ${first.id}`;
    expect(row).toMatchObject({ starts_at: null, ends_at: null, offset_minutes: null });
  });

  it("outra parceira não vê, não edita e não remove os CTAs alheios; nem cria na transmissão alheia (RLS)", async () => {
    const [mine] = await repo.listByStream(ana, anaStream);
    expect(await repo.listByStream(bia, anaStream)).toEqual([]);
    expect(await repo.find(bia, mine.id)).toBeNull();
    expect(await repo.update(bia, mine.id, cta(anaStream, { title: "Invadido" }))).toBeNull();
    expect(await repo.remove(bia, mine.id)).toBe(false);
    await expect(repo.create(bia, cta(anaStream))).rejects.toThrow(/row-level security/);
    // Sem o filtro da aplicação, a RLS sozinha segura a leitura e a escrita.
    expect(await asUser(bia, (tx) => tx`select id from live.ctas where stream_id = ${anaStream}`, db)).toHaveLength(0);
    expect(await asUser(bia, (tx) => tx`update live.ctas set title = 'Invadido' where id = ${mine.id} returning id`, db)).toHaveLength(0);
    expect((await repo.find(ana, mine.id))?.title).not.toBe("Invadido");
    expect(await repo.create(bia, cta(biaStream))).toMatchObject({ ownerId: bia });
  });

  it("ninguém cria em nome de outro dono; admin lê, mas não altera", async () => {
    const insertAs = (owner: string) =>
      asUser(
        bia,
        (tx) => tx`insert into live.ctas (stream_id, owner_id, type, href, external, title, button_label, schedule_kind, offset_minutes, duration_minutes)
                   values (${biaStream}, ${owner}, 'link', 'https://instagram.com/bar', true, 'Em nome de outro', 'Abrir', 'relative', 0, 5)`,
        db,
      );
    await expect(insertAs(ana)).rejects.toThrow(/row-level security/);
    const [mine] = await repo.listByStream(ana, anaStream);
    expect(await asUser(adm, (tx) => tx`select id from live.ctas where id = ${mine.id}`, db)).toHaveLength(1);
    expect(await asUser(adm, (tx) => tx`delete from live.ctas where id = ${mine.id} returning id`, db)).toHaveLength(0);
  });

  it("o banco recusa agendamento incoerente e destino fora do padrão", async () => {
    await expect(repo.create(ana, cta(anaStream, { schedule: { kind: "recurring", intervalMinutes: 10, durationMinutes: 10 } }))).rejects.toThrow(/ctas_schedule_shape/);
    await expect(repo.create(ana, cta(anaStream, { schedule: { kind: "absolute", startsAt: new Date("2026-10-02T12:00:00Z"), endsAt: new Date("2026-10-04T12:00:00Z") } }))).rejects.toThrow(/ctas_schedule_shape/);
    await expect(repo.create(ana, cta(anaStream, { href: "http://instagram.com/bar" }))).rejects.toThrow(/check/);
    await expect(repo.create(ana, cta(anaStream, { href: "/lugares/x", external: true }))).rejects.toThrow(/ctas_external_href/);
  });

  it("disparo manual (#181): só a dona solta e tira do ar; o banco limita a duração", async () => {
    const [mine] = await repo.listByStream(ana, anaStream);
    const at = new Date("2026-10-02T23:30:00Z");
    const until = new Date("2026-10-02T23:40:00Z");
    expect(await repo.setTrigger(bia, mine.id, { at, until })).toBeNull();
    expect(await repo.setTrigger(ana, mine.id, { at, until })).toMatchObject({ id: mine.id, triggeredAt: at, triggeredUntil: until });
    expect((await repo.listForStream(anaStream)).find((c) => c.id === mine.id)).toMatchObject({ triggeredUntil: until });
    await expect(repo.setTrigger(ana, mine.id, { at, until: new Date("2026-10-03T01:00:00Z") })).rejects.toThrow(/ctas_trigger_shape/);
    expect(await repo.setTrigger(bia, mine.id, null)).toBeNull();
    expect(await repo.setTrigger(ana, mine.id, null)).toMatchObject({ triggeredAt: null, triggeredUntil: null });
  });

  it("moderação (#182): só quem tem content:edit desativa e reativa; a dona não reativa nem a moderação reescreve", async () => {
    const [mine] = await repo.listByStream(ana, anaStream);
    // A dona e outra parceira não desativam (o gatilho recusa a dona; a RLS esconde da outra).
    await expect(repo.setDisabled(ana, mine.id, true)).rejects.toThrow(/só a moderação/);
    expect(await repo.setDisabled(bia, mine.id, true)).toBeNull();

    const disabled = await repo.setDisabled(mod, mine.id, true);
    expect(disabled?.disabledAt).toBeInstanceOf(Date);
    const [row] = await db`select disabled_by from live.ctas where id = ${mine.id}`;
    expect(row.disabled_by).toBe(mod);
    expect((await repo.listAll(mod, 50)).find((c) => c.id === mine.id)).toMatchObject({ title: mine.title, entityType: "place" });
    expect((await repo.listAll(bia, 50)).some((c) => c.id === mine.id)).toBe(false);

    // Desativada: a dona ainda edita o conteúdo, mas não reativa; a moderação não altera o conteúdo.
    expect(await repo.update(ana, mine.id, cta(anaStream, { title: "Título corrigido", schedule: { kind: "recurring", intervalMinutes: 20, durationMinutes: 5 } }))).toMatchObject({ title: "Título corrigido", disabledAt: disabled!.disabledAt });
    await expect(repo.setDisabled(ana, mine.id, false)).rejects.toThrow(/só a moderação/);
    await expect(asUser(adm, (tx) => tx`update live.ctas set title = 'Reescrito' where id = ${mine.id}`, db)).rejects.toThrow(/só o dono/);

    expect(await repo.setDisabled(adm, mine.id, false)).toMatchObject({ disabledAt: null });
    expect(await repo.setDisabled(adm, crypto.randomUUID(), true)).toBeNull();
  });

  it("analytics aceita impressão e toque só para a entidade chamada", async () => {
    const id = crypto.randomUUID();
    await db`insert into analytics.events (kind, entity_type, entity_id, source) values ('cta_impression', 'cta', ${id}, 'ui'), ('cta_click', 'cta', ${id}, 'ui')`;
    await expect(db`insert into analytics.events (kind, entity_type, entity_id, source) values ('view', 'cta', ${id}, 'ui')`).rejects.toThrow(/events_cta_kind_check/);
    await expect(db`insert into analytics.events (kind, entity_type, entity_id, source) values ('cta_click', 'place', ${id}, 'ui')`).rejects.toThrow(/events_cta_kind_check/);
    await db`delete from analytics.events where entity_id = ${id}`;
  });

  it("remove o próprio CTA; os CTAs somem com a transmissão", async () => {
    const [mine] = await repo.listByStream(ana, anaStream);
    expect(await repo.remove(ana, mine.id)).toBe(true);
    expect(await repo.remove(ana, mine.id)).toBe(false);
    expect(await repo.listByStream(ana, anaStream)).toHaveLength(2);
    await db`delete from live.streams where id = ${anaStream}`;
    expect(await repo.listByStream(ana, anaStream)).toEqual([]);
  });
});
