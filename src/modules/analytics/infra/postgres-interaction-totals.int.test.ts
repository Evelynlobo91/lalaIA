import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresInteractionStore } from "./postgres-interaction-store";
import { PostgresInteractionTotals } from "./postgres-interaction-totals";

const db = sql();
const store = new PostgresInteractionStore(db);
const reader = new PostgresInteractionTotals(db);
const live = crypto.randomUUID();
const otherLive = crypto.randomUUID();
const place = crypto.randomUUID();
const old = new Date("2030-01-01T12:00:00Z");
const recent = new Date("2030-01-10T12:00:00Z");

beforeAll(async () => {
  for (const occurredAt of [old, recent, recent]) await store.record({ kind: "live_view", entityType: "live", entityId: live, source: "ui", occurredAt });
  await store.record({ kind: "live_view", entityType: "live", entityId: otherLive, source: "ui", occurredAt: recent });
  await store.record({ kind: "view", entityType: "place", entityId: place, source: "ui", occurredAt: recent });
  // Mesmo id com outro tipo de entidade não entra na conta da live.
  await store.record({ kind: "view", entityType: "place", entityId: live, source: "ui", occurredAt: recent });
});

afterAll(async () => {
  await db`delete from analytics.events where entity_id in (${live}, ${otherLive}, ${place})`;
  await db.end();
});

const sorted = <T extends { entityId: string; kind: string }>(rows: T[]) => [...rows].sort((a, b) => (a.entityId + a.kind).localeCompare(b.entityId + b.kind));

describe("PostgresInteractionTotals (#54)", () => {
  it("conta por entidade e tipo, desde sempre ou a partir de uma data", async () => {
    expect(sorted(await reader.totals("live", [live, otherLive], null))).toEqual(
      sorted([
        { entityId: live, kind: "live_view", total: 3 },
        { entityId: otherLive, kind: "live_view", total: 1 },
      ]),
    );
    expect(await reader.totals("live", [live], new Date("2030-01-05T00:00:00Z"))).toEqual([{ entityId: live, kind: "live_view", total: 2 }]);
    expect(await reader.totals("place", [place, crypto.randomUUID()], null)).toEqual([{ entityId: place, kind: "view", total: 1 }]);
  });

  it("usa o índice por entidade (não varre a tabela)", async () => {
    const plan = await db.begin(async (tx) => {
      // Tabela pequena no teste: sem isto o planner preferiria a varredura. Confere que o índice serve à consulta.
      await tx`set local enable_seqscan = off`;
      return tx.unsafe(
        `explain (format json) select entity_id, kind, count(*) from analytics.events
         where entity_type = 'live' and entity_id = any($1::uuid[]) and occurred_at >= $2 group by entity_id, kind`,
        [[live, otherLive], recent],
      );
    });
    expect(JSON.stringify(plan)).toContain("events_entity_idx");
  });
});
