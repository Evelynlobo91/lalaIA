import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresAgentHeartbeats } from "./postgres-agent-heartbeats";

const db = sql();
const repo = new PostgresAgentHeartbeats(db);
const ana = crypto.randomUUID();
const key = `chave-do-agente-${crypto.randomUUID()}`;
let stream: string;
const beat = { privacy_mode: "on" as const, blur_mode: "faces" as const, fps: 29.5, faces_per_frame: 1.25, detector_status: "ok" };

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${ana}, ${`hb-${ana}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner')`;
  [{ id: stream }] = await db<{ id: string }[]>`
    insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
    values (${ana}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, 'live') returning id`;
  await db`insert into live.stream_credentials (stream_id, owner_id, stream_key) values (${stream}, ${ana}, ${key})`;
});

afterAll(async () => {
  await db`delete from auth.users where id = ${ana}`;
  await db.end();
});

describe("PostgresAgentHeartbeats (#198)", () => {
  it("a chave de transmissão identifica a transmissão; chave errada não acha nada", async () => {
    expect(await repo.streamByKey(key)).toMatchObject({ id: stream, ownerId: ana, control: "on", status: "live" });
    expect(await repo.streamByKey("chave-que-nao-existe-123")).toBeNull();
  });

  it("guarda só o último heartbeat de cada transmissão", async () => {
    const first = await repo.save(stream, beat);
    expect(first).toMatchObject({ streamId: stream, privacyMode: "on", blurMode: "faces", fps: 29.5, facesPerFrame: 1.25, detectorStatus: "ok" });
    await repo.save(stream, { ...beat, blur_mode: "full", detector_status: "detector lento", fps: 12 });
    const latest = await repo.latest([stream, crypto.randomUUID()]);
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ blurMode: "full", detectorStatus: "detector lento", fps: 12 });
    expect(await repo.latest([])).toEqual([]);
  });

  it("pausa pelo sistema: tira do ar, registra no log de ciclo de vida e não repete", async () => {
    expect(await repo.pauseBySystem(stream)).toMatchObject({ control: "paused", status: "paused" });
    expect(await repo.pauseBySystem(stream)).toBeNull();
    const events = await db`select source, kind, status_after, actor_id from live.stream_lifecycle_events where stream_id = ${stream}`;
    expect(events).toEqual([expect.objectContaining({ source: "system", kind: "paused", status_after: "paused", actor_id: null })]);
  });

  it("ninguém lê nem grava heartbeats como usuário, nem a dona da transmissão", async () => {
    await expect(asUser(ana, (tx) => tx`select * from live.agent_heartbeats`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`update live.agent_heartbeats set privacy_mode = 'on'`, db)).rejects.toThrow(/permission denied/);
  });
});
