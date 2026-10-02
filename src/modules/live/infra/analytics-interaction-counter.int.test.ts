import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { AnalyticsInteractionCounter } from "./analytics-interaction-counter";

// Contra o banco, pela API pública real do Analytics.
const db = sql();
const counter = new AnalyticsInteractionCounter();
const streamId = crypto.randomUUID();

afterAll(async () => {
  await db`delete from analytics.events where entity_id = ${streamId}`;
  await db.end();
});

describe("AnalyticsInteractionCounter (#54)", () => {
  it("conta os live_view da transmissão, desde sempre e na janela", async () => {
    await db`insert into analytics.events (kind, entity_type, entity_id, source, occurred_at)
             values ('live_view', 'live', ${streamId}, 'ui', now() - interval '10 days'),
                    ('live_view', 'live', ${streamId}, 'ui', now() - interval '1 hour')`;
    expect(await counter.totals("live", [streamId])).toEqual({ [streamId]: { live_view: 2 } });
    expect(await counter.totals("live", [streamId], new Date(Date.now() - 7 * 24 * 3600 * 1000))).toEqual({ [streamId]: { live_view: 1 } });
  });
});
