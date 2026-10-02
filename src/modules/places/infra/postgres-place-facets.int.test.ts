import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresPlaceFacets } from "./postgres-place-facets";

const db = sql();
const facets = new PostgresPlaceFacets(db);
const prefix = `facetas-${Date.now()}`;
let cafe: string;
let parque: string;

beforeAll(async () => {
  const insert = async (n: number, category: string, neighborhood: string | null) => {
    const [row] = await db<{ id: string }[]>`
      insert into places.places (source, source_id, name, category, neighborhood, location)
      values ('osm', ${`${prefix}/${n}`}, ${`Lugar ${prefix} ${n}`}, ${category}, ${neighborhood}, extensions.st_makepoint(-48.84, -26.3)::extensions.geography)
      returning id`;
    return row.id;
  };
  cafe = await insert(1, "cafes", "Centro");
  parque = await insert(2, "ar-livre", null);
});

afterAll(async () => {
  await db`delete from places.places where source_id like ${`${prefix}/%`}`;
  await db.end();
});

describe("PostgresPlaceFacets", () => {
  it("categoria e bairro de cada id; inexistentes ficam de fora", async () => {
    const result = await facets.facetsOf([cafe, parque, crypto.randomUUID()]);
    expect(result.sort((a, b) => a.category.localeCompare(b.category))).toEqual([
      { id: parque, category: "ar-livre", neighborhood: null },
      { id: cafe, category: "cafes", neighborhood: "Centro" },
    ]);
  });
});
