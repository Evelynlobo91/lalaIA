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
  for (const id of [ana, bia, adm]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`cta-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner'), (${adm}, 'admin')`;
  anaStream = await stream(ana);
  biaStream = await stream(bia);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${adm})`;
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

  it("remove o próprio CTA; os CTAs somem com a transmissão", async () => {
    const [mine] = await repo.listByStream(ana, anaStream);
    expect(await repo.remove(ana, mine.id)).toBe(true);
    expect(await repo.remove(ana, mine.id)).toBe(false);
    expect(await repo.listByStream(ana, anaStream)).toHaveLength(2);
    await db`delete from live.streams where id = ${anaStream}`;
    expect(await repo.listByStream(ana, anaStream)).toEqual([]);
  });
});
