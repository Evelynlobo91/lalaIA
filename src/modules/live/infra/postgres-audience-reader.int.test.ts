import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresAudienceReader } from "./postgres-audience-reader";
import { PostgresReactionRepository } from "./postgres-reaction-repository";

const db = sql();
const reader = new PostgresAudienceReader(db);
const presence = new PostgresReactionRepository(db);
const ana = crypto.randomUUID();
const tab = (n: number) => `aud${String(n).padStart(20, "0")}`;
let stream: string;

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${ana}, ${`aud-${ana}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  [{ id: stream }] = await db<{ id: string }[]>`
    insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, signal)
    values (${ana}, 'place', ${crypto.randomUUID()}, 'fake', ${`fake-${crypto.randomUUID()}`}, ${`fake-${crypto.randomUUID()}`}, 'live') returning id`;
});

afterAll(async () => {
  await db`delete from auth.users where id = ${ana}`;
  await db.end();
});

describe("PostgresAudienceReader e amostra por minuto (#56)", () => {
  it("agora: conta as abas com batimento recente nas lives no ar", async () => {
    const before = await reader.now();
    for (const n of [1, 2, 3]) await presence.beat(stream, tab(n), 15);
    const after = await reader.now();
    expect(after.viewers - before.viewers).toBe(3);
    expect(after.liveStreams).toBeGreaterThanOrEqual(1);
  });

  it("a amostra do minuto guarda quantos assistiam; repetir no mesmo minuto não soma de novo", async () => {
    await db`select live.sample_audience()`;
    await db`select live.sample_audience()`;
    const rows = await db`select viewers from live.audience_samples where stream_id = ${stream}`;
    expect(rows).toEqual([expect.objectContaining({ viewers: 3 })]);
  });

  it("mês: soma os espectadores-minuto e acha o pico; live pausada deixa de ser amostrada", async () => {
    await db`insert into live.audience_samples (minute, stream_id, viewers) values (date_trunc('minute', now()) - interval '10 minutes', ${stream}, 10), (date_trunc('minute', now()) - interval '40 days', ${stream}, 500)`;
    const since = new Date(Date.now() - 86_400_000);
    const mine = await db<{ total: string; peak: number }[]>`select sum(viewers) as total, max(viewers)::int as peak from live.audience_samples where stream_id = ${stream} and minute >= ${since}`;
    expect(Number(mine[0].total)).toBe(13);
    const month = await reader.month(since);
    expect(month.viewerMinutes).toBeGreaterThanOrEqual(13);
    expect(month.peakViewers).toBeGreaterThanOrEqual(10);
    expect((await reader.month(new Date(Date.now() + 86_400_000))).viewerMinutes).toBe(0);

    await db`update live.streams set control = 'paused' where id = ${stream}`;
    await db`delete from live.audience_samples where stream_id = ${stream} and minute = date_trunc('minute', now())`;
    await db`select live.sample_audience()`;
    expect(await db`select 1 from live.audience_samples where stream_id = ${stream} and minute = date_trunc('minute', now())`).toHaveLength(0);
  });

  it("ninguém lê as amostras nem roda a amostragem como usuário; ela está agendada a cada minuto", async () => {
    await expect(asUser(ana, (tx) => tx`select * from live.audience_samples`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`select live.sample_audience()`, db)).rejects.toThrow(/permission denied/);
    expect(await db`select schedule from cron.job where jobname = 'live-audience-sample'`).toEqual([expect.objectContaining({ schedule: "* * * * *" })]);
  });
});
