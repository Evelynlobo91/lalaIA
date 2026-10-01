import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { NewStream } from "../domain/stream";
import { PostgresStreamRepository } from "./postgres-stream-repository";

const db = sql();
const repo = new PostgresStreamRepository(db);
const ana = crypto.randomUUID(); // parceira, dona
const bia = crypto.randomUUID(); // outra parceira
const adm = crypto.randomUUID(); // admin
const leo = crypto.randomUUID(); // usuário comum

const newStream = (patch: Partial<NewStream> = {}): NewStream => ({
  entityType: "place",
  entityId: crypto.randomUUID(),
  provider: "fake",
  providerStreamId: `fake-${crypto.randomUUID()}`,
  playbackId: `fake-${crypto.randomUUID()}`,
  streamKey: "chave-secreta-de-teste-1234567890",
  ...patch,
});

beforeAll(async () => {
  for (const id of [ana, bia, adm, leo]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`live-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner'), (${adm}, 'admin')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${adm}, ${leo})`;
  await db.end();
});

describe("PostgresStreamRepository (#47: chave só para o dono)", () => {
  it("parceira cria a transmissão; status inicial 'aguardando sinal'; uma por lugar/evento", async () => {
    const input = newStream();
    const created = await repo.create(ana, input);
    expect(created).toMatchObject({ ownerId: ana, entityType: "place", entityId: input.entityId, control: "on", signal: "offline", status: "waiting" });
    expect(await repo.findByTarget(input)).toMatchObject({ id: created!.id });
    expect(await repo.create(ana, newStream({ entityId: input.entityId }))).toBeNull();
    expect(await repo.create(bia, newStream({ entityId: input.entityId }))).toBeNull();
  });

  it("só a dona lê e rotaciona a chave (nem outra parceira, nem admin)", async () => {
    const created = (await repo.create(ana, newStream()))!;
    expect(await repo.keyFor(ana, created.id)).toBe("chave-secreta-de-teste-1234567890");
    expect(await repo.keyFor(bia, created.id)).toBeNull();
    expect(await repo.keyFor(adm, created.id)).toBeNull();

    expect(await repo.saveKey(bia, created.id, "chave-forjada-1234567890")).toBe(false);
    expect(await repo.saveKey(ana, created.id, "chave-nova-de-teste-1234567890")).toBe(true);
    expect(await repo.keyFor(ana, created.id)).toBe("chave-nova-de-teste-1234567890");
  });

  it("a chave não aparece na leitura das transmissões", async () => {
    const created = (await repo.create(ana, newStream()))!;
    expect(JSON.stringify(await repo.findById(created.id))).not.toContain("chave");
    expect(JSON.stringify(await repo.listByOwner(ana))).not.toContain("chave");
  });

  it("RLS: usuário comum não cria; ninguém cria em nome de outra pessoa nem lê chave alheia", async () => {
    await expect(repo.create(leo, newStream())).rejects.toThrow(/row-level security/);
    await expect(
      asUser(bia, (tx) => tx`insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id) values (${ana}, 'place', ${crypto.randomUUID()}, 'fake', ${crypto.randomUUID()}, 'pb')`, db),
    ).rejects.toThrow(/row-level security/);
    const created = (await repo.create(ana, newStream()))!;
    const seen = await asUser(bia, (tx) => tx`select stream_key from live.stream_credentials where stream_id = ${created.id}`, db);
    expect(seen).toHaveLength(0);
    // Chave para a transmissão de outra pessoa: barrada.
    await expect(asUser(bia, (tx) => tx`insert into live.stream_credentials (stream_id, owner_id, stream_key) values (${created.id}, ${bia}, 'chave-forjada-1234567890')`, db)).rejects.toThrow();
  });

  it("column grants: como usuário, sinal, dono e vínculo não mudam", async () => {
    const created = (await repo.create(ana, newStream()))!;
    for (const column of ["signal = 'live'", `owner_id = '${bia}'`, `entity_id = '${crypto.randomUUID()}'`, "provider_stream_id = 'x'"]) {
      await expect(asUser(ana, (tx) => tx.unsafe(`update live.streams set ${column} where id = $1`, [created.id]), db)).rejects.toThrow(/permission denied/);
    }
  });

  it("listLive só traz transmissões ao vivo", async () => {
    const created = (await repo.create(ana, newStream()))!;
    expect((await repo.listLive(500)).some((s) => s.id === created.id)).toBe(false);
    await db`update live.streams set signal = 'live' where id = ${created.id}`;
    expect((await repo.listLive(500)).find((s) => s.id === created.id)?.status).toBe("live");
  });
});

describe("situação atual (#53)", () => {
  it("dona e admin atualizam; outra parceira não; limpar volta a null", async () => {
    const created = (await repo.create(ana, newStream()))!;
    expect(created.note).toBeNull();
    expect((await repo.setNote(ana, created.id, "Casa cheia"))?.note).toBe("Casa cheia");
    expect(await repo.setNote(bia, created.id, "Forjada")).toBeNull();
    expect((await repo.findById(created.id))?.note).toBe("Casa cheia");
    expect((await repo.setNote(adm, created.id, "Show começa 22h"))?.note).toBe("Show começa 22h");
    expect((await repo.setNote(ana, created.id, null))?.note).toBeNull();
  });

  it("o banco recusa situação acima de 80 caracteres ou vazia", async () => {
    const created = (await repo.create(ana, newStream()))!;
    await expect(repo.setNote(ana, created.id, "x".repeat(81))).rejects.toThrow(/check constraint/);
    await expect(repo.setNote(ana, created.id, "")).rejects.toThrow(/check constraint/);
  });
});
