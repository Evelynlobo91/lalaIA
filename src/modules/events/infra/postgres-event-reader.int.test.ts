import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { EventCard, EventCursor } from "../domain/event-card";
import { PostgresEventReader } from "./postgres-event-reader";

const db = sql();
const reader = new PostgresEventReader(db);
const owner = crypto.randomUUID();
const now = new Date("2031-06-01T12:00:00Z"); // "agora" fixo, no futuro, isolado de outros dados
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`er-${owner}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  const add = (title: string, start: number, end: number, status = "scheduled") =>
    db`insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, status, cancelled_at)
       values (${owner}, ${crypto.randomUUID()}, ${title}, 'Evento de teste de leitura.', 'shows', ${hours(start)}, ${hours(end)}, ${status}, ${status === "cancelled" ? now : null})`;
  await add("acontecendo", -1, 2);
  for (let i = 1; i <= 7; i++) await add(`futuro ${i}`, i, i + 1);
  await add("terminou", -5, -1);
  await add("cancelado", 3, 4, "cancelled");
});

afterAll(async () => {
  await db`delete from auth.users where id = ${owner}`;
  await db.end();
});

const ours = (cards: EventCard[]) => cards.filter((c) => c.title === "acontecendo" || c.title.startsWith("futuro") || c.title === "terminou" || c.title === "cancelado");

describe("PostgresEventReader.listUpcoming", () => {
  it("traz o que ainda não terminou, por início; sem terminados nem cancelados", async () => {
    const titles = ours(await reader.listUpcoming({ now, cursor: null, limit: 500 })).map((c) => c.title);
    expect(titles).toEqual(["acontecendo", "futuro 1", "futuro 2", "futuro 3", "futuro 4", "futuro 5", "futuro 6", "futuro 7"]);
  });

  it("filtro de período pega quem se sobrepõe (evento que já começou e ainda vai até o período também entra)", async () => {
    const window = { from: hours(2.5), to: hours(4.5) };
    const titles = ours(await reader.listUpcoming({ now, cursor: null, limit: 500, window })).map((c) => c.title);
    // futuro 2 (2→3) termina dentro; futuro 3 (3→4) e futuro 4 (4→5) estão dentro/atravessam; futuro 1 (1→2) e 5 (5→6) ficam de fora.
    expect(titles).toEqual(["futuro 2", "futuro 3", "futuro 4"]);
  });

  it("paginando pelo cursor, cada evento aparece uma vez", async () => {
    const seen: string[] = [];
    let cursor: EventCursor | null = null;
    for (;;) {
      const page = await reader.listUpcoming({ now, cursor, limit: 3 });
      seen.push(...ours(page).map((c) => c.title));
      if (page.length < 3) break;
      cursor = { startsAt: page.at(-1)!.startsAt, id: page.at(-1)!.id };
    }
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
  });
});
