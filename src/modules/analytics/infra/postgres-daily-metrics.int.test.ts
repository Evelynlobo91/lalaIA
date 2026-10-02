import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresDailyMetrics } from "./postgres-daily-metrics";

const db = sql();
const reader = new PostgresDailyMetrics(db);
const place = crypto.randomUUID();
const event = crypto.randomUUID();
const other = crypto.randomUUID();
// Dias fixos no futuro, isolados de outros dados. "Hoje" = 2031-03-10.
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00-03:00`);

beforeAll(async () => {
  const add = (entityType: string, entityId: string, kind: string, when: Date) =>
    db`insert into analytics.events (kind, entity_type, entity_id, source, occurred_at) values (${kind}, ${entityType}, ${entityId}, 'ui', ${when})`;
  await add("place", place, "view", at("2031-03-08", 10));
  await add("place", place, "view", at("2031-03-08", 23)); // 23h em Joinville = dia seguinte em UTC: conta no dia 08
  await add("place", place, "view", at("2031-03-09", 12));
  await add("event", event, "view", at("2031-03-09", 12));
  await add("place", other, "view", at("2031-03-09", 12)); // entidade não pedida
  await db`select analytics.refresh_daily_metrics()`;
  // Depois do refresh: dia de hoje só na tabela (o painel lê ao vivo).
  await add("place", place, "view", at("2031-03-10", 9));
  await add("place", place, "view", at("2031-03-10", 22));
});

afterAll(async () => {
  await db`delete from analytics.events where entity_id in (${place}, ${event}, ${other})`;
  await db`select analytics.refresh_daily_metrics()`;
  await db.end();
});

describe("PostgresDailyMetrics", () => {
  it("dias fechados da view + hoje ao vivo, no calendário de Joinville, só das entidades pedidas", async () => {
    const rows = await reader.daily({ refs: { place: [place], event: [event] }, from: "2031-03-01", to: "2031-03-31", today: "2031-03-10" });
    expect(rows).toEqual([
      { day: "2031-03-08", entityType: "place", entityId: place, kind: "view", total: 2 },
      { day: "2031-03-09", entityType: "event", entityId: event, kind: "view", total: 1 },
      { day: "2031-03-09", entityType: "place", entityId: place, kind: "view", total: 1 },
      { day: "2031-03-10", entityType: "place", entityId: place, kind: "view", total: 2 },
    ]);
  });

  it("respeita o período e não lê hoje quando ele está fora", async () => {
    const rows = await reader.daily({ refs: { place: [place] }, from: "2031-03-09", to: "2031-03-09", today: "2031-03-10" });
    expect(rows.map((r) => [r.day, r.total])).toEqual([["2031-03-09", 1]]);
  });

  it("refresh é concorrente (índice único) e a view fica fora do alcance da API", async () => {
    const [idx] = await db<{ n: number }[]>`select count(*)::int as n from pg_indexes where schemaname = 'analytics' and indexname = 'daily_metrics_key'`;
    expect(idx!.n).toBe(1);
    const [grants] = await db<{ anon: boolean; auth: boolean }[]>`
      select has_table_privilege('anon', 'analytics.daily_metrics', 'select') as anon,
             has_table_privilege('authenticated', 'analytics.daily_metrics', 'select') as auth`;
    expect(grants).toEqual({ anon: false, auth: false });
  });
});
