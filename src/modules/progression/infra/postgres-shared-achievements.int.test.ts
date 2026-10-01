import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresSharedAchievements } from "./postgres-shared-achievements";

const db = sql();
const userId = crypto.randomUUID();
let unlockId = "";

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${userId}, ${`share-${userId}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  const [row] = await db<{ id: string }[]>`insert into progression.achievements (user_id, achievement_id) values (${userId}, 'primeira-missao') returning id`;
  unlockId = row!.id;
});

afterAll(async () => {
  await db`delete from auth.users where id = ${userId}`;
  await db.end();
});

describe("PostgresSharedAchievements", () => {
  it("lê o desbloqueio pelo id do link (sem sessão do dono); id desconhecido → null", async () => {
    const reader = new PostgresSharedAchievements(db);
    expect(await reader.findByUnlockId(unlockId)).toMatchObject({ achievementId: "primeira-missao", userId, unlockedAt: expect.any(Date) });
    expect(await reader.findByUnlockId(crypto.randomUUID())).toBeNull();
  });

  it("some quando a conta é excluída (cascata, LGPD)", async () => {
    await db`delete from auth.users where id = ${userId}`;
    expect(await new PostgresSharedAchievements(db).findByUnlockId(unlockId)).toBeNull();
  });
});
