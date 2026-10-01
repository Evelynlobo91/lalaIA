import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { PlaceCard, PlaceCursor } from "../domain/place-card";
import type { PlaceSearchFilter } from "../features/search-places/search-places";
import { PostgresPlaceImportRepository } from "./postgres-place-import-repository";
import { PostgresPlaceSearch } from "./postgres-place-search";

const db = sql();
const search = new PostgresPlaceSearch(db);
const tag = `busca${Date.now().toString(36)}`;
const places = [
  { name: `Açaí da Praça ${tag}`, category: "cafes" as const },
  { name: `Restaurante Japonês ${tag}`, category: "restaurantes" as const },
  { name: `Bar do Zé ${tag}`, category: "bares" as const },
  { name: `Museu Fritz ${tag}`, category: "cultura" as const },
];

beforeAll(async () => {
  await new PostgresPlaceImportRepository(db).upsertMany(
    places.map((p, i) => ({
      source: "osm" as const,
      sourceId: `${tag}/${i}`,
      name: p.name,
      category: p.category,
      address: { street: null, houseNumber: null, neighborhood: null, postcode: null, city: "Joinville" },
      phone: null,
      website: null,
      openingHours: null,
      location: { lat: -26.3, lon: -48.84 },
    })),
  );
});

afterAll(async () => {
  await db`delete from places.places where source_id like ${`${tag}/%`}`;
  await db.end();
});

const names = async (filter: PlaceSearchFilter) => (await search.search(filter, null, 500)).map((p) => p.name).filter((n) => n.endsWith(tag));

describe("PostgresPlaceSearch", () => {
  it("tolera acentos nos dois sentidos e acha por prefixo enquanto digita", async () => {
    expect(await names({ text: `acai ${tag}` })).toEqual([`Açaí da Praça ${tag}`]);
    expect(await names({ text: `JAPONES ${tag}` })).toEqual([`Restaurante Japonês ${tag}`]);
    expect(await names({ text: `restau ${tag}` })).toEqual([`Restaurante Japonês ${tag}`]);
    expect(await names({ text: `japo ${tag}` })).toEqual([`Restaurante Japonês ${tag}`]);
    expect(await names({ text: `restaurantes ${tag}` })).toEqual([`Restaurante Japonês ${tag}`]); // plural → mesmo radical
    expect(await names({ text: `pra ${tag}` })).toEqual([`Açaí da Praça ${tag}`]); // prefixo sem acento
  });

  it("todos os termos precisam estar no nome; stopwords não atrapalham", async () => {
    expect(await names({ text: `bar do ze ${tag}` })).toEqual([`Bar do Zé ${tag}`]);
    expect(await names({ text: `bar japones ${tag}` })).toEqual([]);
  });

  it("acha pelo nome da categoria (mesmo sem a palavra no nome do lugar)", async () => {
    const bares = (await search.search({ text: "bares" }, null, 1000)).map((p) => p.name);
    expect(bares).toContain(`Bar do Zé ${tag}`);
    expect((await search.search({ text: "bares" }, null, 1000)).every((p) => p.category === "bares" || /bar/i.test(p.name))).toBe(true);
  });

  it("paginando pelo cursor, cada resultado aparece uma vez e em ordem alfabética", async () => {
    const all: PlaceCard[] = [];
    let cursor: PlaceCursor | null = null;
    for (;;) {
      const page = await search.search({ text: tag }, cursor, 2);
      all.push(...page);
      if (page.length < 2) break;
      cursor = { name: page.at(-1)!.name, id: page.at(-1)!.id };
    }
    expect(all.map((p) => p.name)).toEqual([`Açaí da Praça ${tag}`, `Bar do Zé ${tag}`, `Museu Fritz ${tag}`, `Restaurante Japonês ${tag}`]);
  });

  it("texto só com pontuação não quebra (nada casa)", async () => {
    expect(await search.search({ text: "!!!" }, null, 10)).toEqual([]);
  });

  it("usa o índice GIN da busca textual", async () => {
    const plan = await db.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx.unsafe(`explain (format json) select id from places.places where (to_tsvector('platform.busca', name) || to_tsvector('platform.busca_simples', name)) @@ to_tsquery('platform.busca', 'acai:*')`);
    });
    expect(JSON.stringify(plan)).toContain("places_name_search_idx");
  });
});
