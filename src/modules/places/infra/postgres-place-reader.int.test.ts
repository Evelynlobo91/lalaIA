import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { PlaceCard, PlaceCursor } from "../domain/place-card";
import { PostgresPlaceImportRepository } from "./postgres-place-import-repository";
import { PostgresPlaceReader } from "./postgres-place-reader";

// Usa um schema-espelho isolado? Não: os testes de integração rodam no banco local, que pode
// ter o seed de Joinville. Por isso as asserções valem para "o conjunto inteiro", seja qual for.
const db = sql();
const reader = new PostgresPlaceReader(db);
const prefix = `leitura-${Date.now()}`;
const names = ["Zebra Bar", "Açaí da Praça", "abacaxi Café", "Árvore Restaurante", "Bar do Zé"];

beforeAll(async () => {
  await new PostgresPlaceImportRepository(db).upsertMany(
    names.map((name, i) => ({
      source: "osm" as const,
      sourceId: `${prefix}/${i}`,
      name,
      category: "bares" as const,
      address: { street: null, houseNumber: null, neighborhood: null, postcode: null, city: "Joinville" },
      phone: null,
      website: null,
      openingHours: null,
      location: { lat: -26.3, lon: -48.84 },
    })),
  );
});

afterAll(async () => {
  await db`delete from places.places where source_id like ${`${prefix}/%`}`;
  await db.end();
});

async function readAll(pageSize: number): Promise<PlaceCard[]> {
  const all: PlaceCard[] = [];
  let cursor: PlaceCursor | null = null;
  for (;;) {
    const page = await reader.listAfter(cursor, pageSize);
    all.push(...page);
    if (page.length < pageSize) return all;
    const last = page.at(-1)!;
    cursor = { name: last.name, id: last.id };
  }
}

describe("PostgresPlaceReader.listAfter", () => {
  it("percorrer todas as páginas traz cada lugar exatamente uma vez", async () => {
    const [{ total }] = await db<{ total: number }[]>`select count(*)::int as total from places.places`;
    const all = await readAll(7);
    expect(all).toHaveLength(total);
    expect(new Set(all.map((p) => p.id)).size).toBe(total);
  });

  it("ordena em português: acentos e maiúsculas não bagunçam a ordem", async () => {
    const ours = (await readAll(50)).filter((p) => names.includes(p.name)).map((p) => p.name);
    expect(ours).toEqual(["abacaxi Café", "Açaí da Praça", "Árvore Restaurante", "Bar do Zé", "Zebra Bar"]);
  });

  it("usa o índice (não varre a tabela) para a página", async () => {
    const plan = await db.unsafe(`explain (format json) select id from places.places order by (name collate places.pt_br), id limit 21`);
    expect(JSON.stringify(plan)).toContain("places_name_id_idx");
  });
});
