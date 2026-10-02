import { afterAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { AuditEntry } from "../domain/audit";
import { PostgresAuditLog } from "./postgres-audit-log";

const db = sql();
const log = new PostgresAuditLog(db);
// Atores exclusivos deste teste: a tabela é append-only, então os registros ficam (filtramos por eles).
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const entry = (patch: Partial<AuditEntry> = {}): AuditEntry => ({
  eventId: crypto.randomUUID(),
  actorId: ana,
  action: "partners.partner_suspended",
  targetType: "partner",
  targetId: crypto.randomUUID(),
  occurredAt: hoursAgo(1),
  ...patch,
});

afterAll(() => db.end());

describe("PostgresAuditLog (#146)", () => {
  it("grava e lista do mais recente para o mais antigo", async () => {
    const older = entry({ occurredAt: hoursAgo(5), action: "places.place_edited_by_admin", targetType: "place" });
    const newer = entry({ occurredAt: hoursAgo(2) });
    await log.append(older);
    await log.append(newer);

    const found = await log.list({ actorId: ana, limit: 10 });
    expect(found.map((e) => e.eventId)).toEqual([newer.eventId, older.eventId]);
    expect(found[1]).toMatchObject({ action: "places.place_edited_by_admin", targetType: "place", targetId: older.targetId });
  });

  it("o mesmo evento não gera dois registros", async () => {
    const once = entry({ actorId: bia });
    await log.append(once);
    await log.append(once);
    expect(await log.list({ actorId: bia, limit: 10 })).toHaveLength(1);
  });

  it("filtra por ação, por pessoa, por período e respeita o limite", async () => {
    expect((await log.list({ actorId: ana, action: "places.place_edited_by_admin", limit: 10 })).every((e) => e.action === "places.place_edited_by_admin")).toBe(true);
    expect(await log.list({ actorId: ana, since: hoursAgo(3), limit: 10 })).toHaveLength(1);
    expect(await log.list({ actorId: ana, limit: 1 })).toHaveLength(1);
    expect((await log.list({ action: "partners.partner_suspended", since: hoursAgo(3), limit: 500 })).some((e) => e.actorId === bia)).toBe(true);
  });

  it("o registro não pode ser alterado nem apagado", async () => {
    await expect(db`update backoffice.audit_log set action = 'x.y' where actor_id = ${ana}`).rejects.toThrow(/append-only/);
    await expect(db`delete from backoffice.audit_log where actor_id = ${ana}`).rejects.toThrow(/append-only/);
  });

  it("o banco recusa ação fora do formato e tipo de alvo desconhecido", async () => {
    await expect(log.append(entry({ action: "Sem Formato" }))).rejects.toThrow(/check/);
    await expect(log.append(entry({ targetType: "usuario" as AuditEntry["targetType"] }))).rejects.toThrow(/check/);
  });

  it("usuários comuns não leem nem gravam a trilha", async () => {
    const someone = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${someone}, ${`au-${someone}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    try {
      await expect(asUser(someone, (tx) => tx`select * from backoffice.audit_log limit 1`, db)).rejects.toThrow(/permission denied/);
    } finally {
      await db`delete from auth.users where id = ${someone}`;
    }
  });
});
