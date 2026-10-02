import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { DatabaseCheck } from "./health-checks";

const db = sql();

afterAll(async () => {
  await db.end();
});

describe("DatabaseCheck", () => {
  it("passa com o banco no ar", async () => {
    await expect(new DatabaseCheck(db).run()).resolves.toBeUndefined();
  });
});
