import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { EventCard, EventCursor } from "../domain/event-card";
import type { EventSearchFilter } from "../features/search-events/search-events";
import { PostgresEventSearch } from "./postgres-event-search";

const db = sql();
const search = new PostgresEventSearch(db);
const owner = crypto.randomUUID();
const tag = `busca${Date.now().toString(36)}`;
const now = new Date("2031-07-01T12:00:00Z"); // "agora" fixo, no futuro, isolado de outros dados
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const stage = crypto.randomUUID(); // lugar do samba e da exposição

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`es-${owner}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  const add = (title: string, description: string, category: string, start: number, opts: { status?: string; price?: number; place?: string } = {}) =>
    db`insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, price_cents, status, cancelled_at)
       values (${owner}, ${opts.place ?? crypto.randomUUID()}, ${`${title} ${tag}`}, ${description}, ${category}, ${hours(start)}, ${hours(start + 2)},
               ${opts.price ?? 0}, ${opts.status ?? "scheduled"}, ${opts.status === "cancelled" ? now : null})`;
  await add("Roda de Samba", "Samba de raiz com feijoada no quintal.", "shows", 1, { place: stage });
  await add("Feira de Artesanato", "Artesãos de Joinville e região, música ao vivo.", "feiras", 2, { price: 4000 });
  await add("Exposição Fotográfica", "Fotografias históricas da cidade.", "exposicoes", 3, { price: 15000, place: stage });
  await add("Samba cancelado", "Este samba foi cancelado pelos organizadores.", "shows", 4, { status: "cancelled" });
  await add("Samba que já passou", "Roda de samba antiga, já terminou.", "shows", -5);
});

afterAll(async () => {
  await db`delete from auth.users where id = ${owner}`;
  await db.end();
});

const ours = (cards: EventCard[]) => cards.filter((c) => c.title.endsWith(tag));

describe("PostgresEventSearch", () => {
  it("acha no título e na descrição, sem acento e por prefixo; ignora cancelados e terminados", async () => {
    const found = ours(await search.search({ now, text: `samba ${tag}` }, null, 500)).map((e) => e.title);
    expect(found).toEqual([`Roda de Samba ${tag}`]);
    expect(ours(await search.search({ now, text: `artesaos ${tag}` }, null, 500)).map((e) => e.title)).toEqual([`Feira de Artesanato ${tag}`]);
    // Prefixo no meio da palavra, que o radical sozinho não acharia ("fotografi" → "Fotográfica").
    expect(ours(await search.search({ now, text: `fotografi ${tag}` }, null, 500)).map((e) => e.title)).toEqual([`Exposição Fotográfica ${tag}`]);
    expect(ours(await search.search({ now, text: `exposicao fotog ${tag}` }, null, 500)).map((e) => e.title)).toEqual([`Exposição Fotográfica ${tag}`]);
    // Descrição: "feijoada" só aparece no texto, não no título.
    expect(ours(await search.search({ now, text: `feijoada ${tag}` }, null, 500)).map((e) => e.title)).toEqual([`Roda de Samba ${tag}`]);
  });

  it("acha pelo nome da categoria", async () => {
    const found = ours(await search.search({ now, text: "feiras" }, null, 1000)).map((e) => e.title);
    expect(found).toEqual([`Feira de Artesanato ${tag}`]);
  });

  it("sem texto traz todos os próximos, por início, com paginação por cursor", async () => {
    const seen: string[] = [];
    let cursor: EventCursor | null = null;
    for (;;) {
      const page = await search.search({ now, text: null }, cursor, 2);
      seen.push(...ours(page).map((e) => e.title));
      if (page.length < 2) break;
      cursor = { startsAt: page.at(-1)!.startsAt, id: page.at(-1)!.id };
    }
    expect(seen).toEqual([`Roda de Samba ${tag}`, `Feira de Artesanato ${tag}`, `Exposição Fotográfica ${tag}`]);
    expect(await search.search({ now, text: "!!!" }, null, 10)).toEqual([]);
  });

  it("filtra por categoria, lugares, períodos (sobreposição) e faixa de preço, combinados", async () => {
    const found = async (f: Partial<EventSearchFilter>) => ours(await search.search({ now, text: tag, ...f }, null, 500)).map((e) => e.title.replace(` ${tag}`, ""));
    expect(await found({ category: "feiras" })).toEqual(["Feira de Artesanato"]);
    expect(await found({ placeIds: [stage] })).toEqual(["Roda de Samba", "Exposição Fotográfica"]);
    expect(await found({ placeIds: [] })).toEqual([]);
    // Samba 1→3h, Feira 2→4h, Exposição 3→5h: o período 3h30→3h45 pega Feira e Exposição.
    expect(await found({ periods: [{ from: hours(3.5), to: hours(3.75) }] })).toEqual(["Feira de Artesanato", "Exposição Fotográfica"]);
    expect(await found({ periods: [{ from: hours(1.5), to: hours(1.5) }, { from: hours(4.5), to: hours(4.6) }] })).toEqual(["Roda de Samba", "Exposição Fotográfica"]);
    expect(await found({ periods: [] })).toEqual([]);
    expect(await found({ price: { minCents: 0, maxCents: 0 } })).toEqual(["Roda de Samba"]);
    expect(await found({ price: { minCents: 0, maxCents: 5000 } })).toEqual(["Roda de Samba", "Feira de Artesanato"]);
    expect(await found({ price: { minCents: 10001, maxCents: null } })).toEqual(["Exposição Fotográfica"]);
    expect(await found({ placeIds: [stage], price: { minCents: 10001, maxCents: null }, periods: [{ from: hours(3), to: hours(4) }] })).toEqual(["Exposição Fotográfica"]);
  });

  it("usa o índice GIN da busca textual", async () => {
    const plan = await db.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx.unsafe(`explain (format json) select id from events.events where (to_tsvector('platform.busca', title || ' ' || description) || to_tsvector('platform.busca_simples', title || ' ' || description)) @@ to_tsquery('platform.busca', 'samba:*')`);
    });
    expect(JSON.stringify(plan)).toContain("events_text_search_idx");
  });
});
