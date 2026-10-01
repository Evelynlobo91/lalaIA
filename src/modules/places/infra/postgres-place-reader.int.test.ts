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

  it("findById traz todos os campos e a coordenada; id inexistente → null", async () => {
    const [{ id }] = await db<{ id: string }[]>`select id from places.places where source_id = ${`${prefix}/0`}`;
    expect(await reader.findById(id)).toMatchObject({ id, name: "Zebra Bar", category: "bares", source: "osm", location: { lat: -26.3, lon: -48.84 } });
    expect(await reader.findById("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("allPoints traz todos os lugares com coordenadas", async () => {
    const [{ total }] = await db<{ total: number }[]>`select count(*)::int as total from places.places`;
    const points = await reader.allPoints();
    expect(points).toHaveLength(total);
    expect(points.find((p) => p.name === "Zebra Bar")).toMatchObject({ lat: -26.3, lon: -48.84, category: "bares" });
  });

  it("nearby: ordena pela distância real, respeita o raio e o próprio ponto fica a 0 m", async () => {
    const origin = { lat: -26.3, lon: -48.84 }; // onde estão os 5 lugares de teste
    const near = await reader.nearby(origin, 1000, 50);

    const distances = near.map((p) => p.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances.every((d) => d <= 1000)).toBe(true);
    expect(near.filter((p) => names.includes(p.name)).every((p) => p.distanceMeters < 1)).toBe(true);
  });

  it("nearby: distância confere com a geografia (Centro → Expoville ≈ 3,4 km)", async () => {
    const expoville = { lat: -26.2893, lon: -48.8157 };
    const near = await reader.nearby(expoville, 10_000, 200);
    const ours = near.find((p) => p.name === "Zebra Bar")!;
    // Zebra Bar está em -26.3,-48.84: ~2,7 km da Expoville.
    expect(ours.distanceMeters).toBeGreaterThan(2_500);
    expect(ours.distanceMeters).toBeLessThan(3_000);
  });

  it("nearby: raio pequeno longe de tudo → vazio", async () => {
    expect(await reader.nearby({ lat: -26.85, lon: -49.5 }, 1000, 10)).toEqual([]);
  });

  it("usa o índice (não varre a tabela) para a página", async () => {
    const plan = await db.unsafe(`explain (format json) select id from places.places order by (name collate places.pt_br), id limit 21`);
    expect(JSON.stringify(plan)).toContain("places_name_id_idx");
  });
});
