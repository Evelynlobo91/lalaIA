import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { signalAfter } from "../domain/stream";
import { HandleProviderWebhook } from "../features/webhooks/webhooks.use-case";
import { FakeStreamingProvider } from "./fake-streaming-provider";
import { PostgresStreamLifecycleLog } from "./postgres-stream-lifecycle-log";
import { PostgresStreamRepository } from "./postgres-stream-repository";
import { signWebhook } from "./webhook-signature";

const db = sql();
const repo = new PostgresStreamRepository(db);
const log = new PostgresStreamLifecycleLog(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const SECRET = "segredo-do-webhook-fake-com-mais-de-32-caracteres";

async function newStream() {
  return (await repo.create(ana, {
    entityType: "event",
    entityId: crypto.randomUUID(),
    provider: "fake",
    providerStreamId: `fake-${crypto.randomUUID()}`,
    playbackId: "pb",
    streamKey: "chave-secreta-de-teste-1234567890",
  }))!;
}

const lifecycleOf = (streamId: string) =>
  db<{ kind: string; status_after: string; provider_event_id: string | null }[]>`select kind, status_after, provider_event_id from live.stream_lifecycle_events where stream_id = ${streamId} order by id`;

beforeAll(async () => {
  for (const id of [ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`live-log-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner')`;
});

afterAll(async () => {
  // Excluir a conta apaga transmissões e o log em cascata (única exceção ao append-only).
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  await db.end();
});

describe("PostgresStreamLifecycleLog (#48)", () => {
  it("grava o evento com timestamp e aplica o sinal; o mesmo evento não é processado duas vezes", async () => {
    const stream = await newStream();
    const event = { eventId: `evt-${crypto.randomUUID()}`, providerStreamId: stream.providerStreamId, kind: "active", occurredAt: new Date(Date.now() + 1000) };
    const first = await log.recordProviderEvent(event, (s) => signalAfter(s, event));
    expect(first.outcome === "applied" && [first.before.status, first.after.status]).toEqual(["waiting", "live"]);
    expect(await log.recordProviderEvent(event, (s) => signalAfter(s, event))).toEqual({ outcome: "duplicate" });
    expect(await lifecycleOf(stream.id)).toEqual([{ kind: "active", status_after: "live", provider_event_id: event.eventId }]);
  });

  it("transmissão desconhecida não grava nada", async () => {
    const event = { eventId: `evt-${crypto.randomUUID()}`, providerStreamId: "nao-existe", kind: "active", occurredAt: new Date() };
    expect(await log.recordProviderEvent(event, (s) => s)).toEqual({ outcome: "unknown_stream" });
  });

  it("webhook ponta a ponta (assinado): status muda e o evento de domínio sai uma vez", async () => {
    const stream = await newStream();
    const bus = new InMemoryEventBus({ onHandlerError: (e) => { throw e; } });
    const published: unknown[] = [];
    bus.subscribe("live.StreamStatusChanged", (e) => {
      published.push(e.payload);
    });
    const handler = new HandleProviderWebhook(() => new FakeStreamingProvider(SECRET), log, bus);
    const body = JSON.stringify({ type: "video.live_stream.active", id: `evt-${crypto.randomUUID()}`, created_at: new Date(Date.now() + 1000).toISOString(), data: { id: stream.providerStreamId } });
    const headers = new Headers({ "mux-signature": signWebhook(SECRET, body) });
    expect((await handler.execute(body, headers)).ok).toBe(true);
    expect((await handler.execute(body, headers)).ok).toBe(true);
    expect(published).toEqual([{ streamId: stream.id, entityType: "event", entityId: stream.entityId, status: "live" }]);
    expect((await repo.findById(stream.id))?.status).toBe("live");
  });

  it("append-only: ninguém altera nem apaga o log (nem o backend); usuário não grava evento do provedor", async () => {
    const stream = await newStream();
    const event = { eventId: `evt-${crypto.randomUUID()}`, providerStreamId: stream.providerStreamId, kind: "idle", occurredAt: new Date() };
    await log.recordProviderEvent(event, (s) => signalAfter(s, event));
    await expect(db`update live.stream_lifecycle_events set kind = 'active' where stream_id = ${stream.id}`).rejects.toThrow(/append-only/);
    await expect(db`delete from live.stream_lifecycle_events where stream_id = ${stream.id}`).rejects.toThrow(/append-only/);
    await expect(
      asUser(ana, (tx) => tx`insert into live.stream_lifecycle_events (stream_id, source, kind, status_after, occurred_at) values (${stream.id}, 'provider', 'active', 'live', now())`, db),
    ).rejects.toThrow();
    // Outra parceira não registra ação na transmissão alheia.
    await expect(
      asUser(bia, (tx) => tx`insert into live.stream_lifecycle_events (stream_id, source, kind, actor_id, status_after, occurred_at) values (${stream.id}, 'partner', 'paused', ${bia}, 'paused', now())`, db),
    ).rejects.toThrow(/row-level security/);
  });
});
