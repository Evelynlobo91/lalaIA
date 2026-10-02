import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { subscriptions } from "../index";
import { PostgresStreamRepository } from "./postgres-stream-repository";

const db = sql();
const repo = new PostgresStreamRepository(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const adm = crypto.randomUUID();

async function newStream(entityType: "place" | "event" = "place", entityId = crypto.randomUUID()) {
  return (await repo.create(ana, {
    entityType,
    entityId,
    provider: "fake",
    providerStreamId: `fake-${crypto.randomUUID()}`,
    playbackId: "pb",
    streamKey: "chave-secreta-de-teste-1234567890",
  }))!;
}

const lifecycleOf = (streamId: string) =>
  db<{ source: string; kind: string; actor_id: string | null; status_after: string }[]>`
    select source, kind, actor_id, status_after from live.stream_lifecycle_events where stream_id = ${streamId} order by id`;

beforeAll(async () => {
  // Assinatura de evento cancelado usa o provedor do ambiente (simulado nos testes).
  process.env.LIVE_FAKE_WEBHOOK_SECRET ??= "segredo-do-webhook-fake-com-mais-de-32-caracteres";
  for (const id of [ana, bia, adm]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`live-ctl-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner'), (${adm}, 'admin')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${adm})`;
  await db.end();
});

describe("controle da transmissão (#49) no banco", () => {
  it("dona pausa e encerra; cada ação vai para o log com quem agiu", async () => {
    const stream = await newStream();
    expect((await repo.setControl(ana, stream.id, { control: "paused", kind: "paused" }))?.status).toBe("paused");
    expect((await repo.setControl(ana, stream.id, { control: "ended", kind: "ended" }))?.status).toBe("ended");
    expect(await lifecycleOf(stream.id)).toEqual([
      { source: "partner", kind: "paused", actor_id: ana, status_after: "paused" },
      { source: "partner", kind: "ended", actor_id: ana, status_after: "ended" },
    ]);
  });

  it("RLS: outra parceira não controla; admin controla", async () => {
    const stream = await newStream();
    expect(await repo.setControl(bia, stream.id, { control: "ended", kind: "ended" })).toBeNull();
    expect((await repo.findById(stream.id))?.status).toBe("waiting");
    expect((await repo.setControl(adm, stream.id, { control: "paused", kind: "paused" }))?.status).toBe("paused");
    expect((await lifecycleOf(stream.id)).map((r) => r.actor_id)).toEqual([adm]);
  });

  it("rotacionar a chave fica no log (sem a chave)", async () => {
    const stream = await newStream();
    await repo.saveKey(ana, stream.id, "chave-nova-de-teste-1234567890");
    const rows = await lifecycleOf(stream.id);
    expect(rows).toEqual([{ source: "partner", kind: "key_rotated", actor_id: ana, status_after: "waiting" }]);
    expect(JSON.stringify(rows)).not.toContain("chave");
  });

  it("evento cancelado (events.EventCancelled) encerra a live do evento, uma vez só", async () => {
    const eventId = crypto.randomUUID();
    const stream = await newStream("event", eventId);
    const bus = new InMemoryEventBus({ onHandlerError: (e) => { throw e; } });
    subscriptions(bus);
    await bus.publish("events.EventCancelled", { eventId });
    await bus.publish("events.EventCancelled", { eventId });
    expect((await repo.findById(stream.id))?.status).toBe("ended");
    expect(await lifecycleOf(stream.id)).toEqual([{ source: "system", kind: "ended", actor_id: null, status_after: "ended" }]);
  });
});
