import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresInteractionStore } from "./postgres-interaction-store";

const db = sql();
const store = new PostgresInteractionStore(db);
const entityId = crypto.randomUUID();
const at = new Date("2031-01-01T12:00:00Z");

afterAll(async () => {
  await db`delete from analytics.events where entity_id = ${entityId}`;
  await db.end();
});

const rows = () => db<{ kind: string; source: string; event_id: string | null }[]>`
  select kind, source, event_id from analytics.events where entity_id = ${entityId} order by id`;

describe("PostgresInteractionStore", () => {
  it("grava interações da tela e de domínio; o mesmo evento de domínio conta uma vez só", async () => {
    const eventId = crypto.randomUUID();
    await store.record({ kind: "view", entityType: "place", entityId, source: "ui", occurredAt: at });
    await store.record({ kind: "view", entityType: "place", entityId, source: "ui", occurredAt: at });
    await store.record({ kind: "favorite", entityType: "place", entityId, source: "domain", eventId, occurredAt: at });
    await store.record({ kind: "favorite", entityType: "place", entityId, source: "domain", eventId, occurredAt: at });

    expect(await rows()).toEqual([
      { kind: "view", source: "ui", event_id: null },
      { kind: "view", source: "ui", event_id: null },
      { kind: "favorite", source: "domain", event_id: eventId },
    ]);
  });

  it("é append-only: UPDATE é recusado", async () => {
    await expect(db`update analytics.events set kind = 'checkin' where entity_id = ${entityId}`).rejects.toThrow(/append-only/);
  });

  it("não guarda dados pessoais: a tabela não tem colunas de usuário, IP ou user agent", async () => {
    const columns = await db<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_schema = 'analytics' and table_name = 'events'`;
    expect(columns.map((c) => c.column_name).sort()).toEqual(["entity_id", "entity_type", "event_id", "id", "kind", "occurred_at", "source"]);
  });

  it("papéis da API (anon/authenticated) não acessam o schema", async () => {
    const [grants] = await db<{ anon: boolean; authenticated: boolean }[]>`
      select has_schema_privilege('anon', 'analytics', 'usage') as anon,
             has_schema_privilege('authenticated', 'analytics', 'usage') as authenticated`;
    expect(grants).toEqual({ anon: false, authenticated: false });
  });
});
