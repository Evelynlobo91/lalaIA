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

  it("pointsByIds: coordenadas só dos ids pedidos; inexistentes e inválidos ficam de fora", async () => {
    const [{ id }] = await db<{ id: string }[]>`select id from places.places where source_id = ${`${prefix}/0`}`;
    expect(await reader.pointsByIds([id, id, "00000000-0000-4000-8000-000000000000", "abc"])).toEqual([{ id, name: "Zebra Bar", category: "bares", lat: -26.3, lon: -48.84 }]);
    expect(await reader.pointsByIds([])).toEqual([]);
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

  it("distancesFrom: distância de um ponto a vários lugares; ids inexistentes ou inválidos ficam de fora", async () => {
    const [{ id }] = await db<{ id: string }[]>`select id from places.places where source_id = ${`${prefix}/0`}`;
    const missing = "00000000-0000-4000-8000-000000000000";
    const distances = await reader.distancesFrom({ lat: -26.2893, lon: -48.8157 }, [id, missing, "nao-e-id"]);
    expect([...distances.keys()]).toEqual([id]);
    expect(distances.get(id)).toBeGreaterThan(2_500);
    expect(distances.get(id)).toBeLessThan(3_000);
    expect(await reader.distancesFrom({ lat: -26.3, lon: -48.84 }, [])).toEqual(new Map());
  });

  it("candidates com origem: só no raio e nas categorias, do mais perto; OSM não é novidade", async () => {
    const found = await reader.candidates({ origin: { lat: -26.3, lon: -48.84 }, radiusMeters: 500, categories: ["bares"], limit: 300 });
    const ours = found.filter((p) => names.includes(p.name));
    expect(ours).toHaveLength(names.length);
    expect(found.every((p) => p.category === "bares" && p.distanceMeters !== null && p.distanceMeters <= 500)).toBe(true);
    const d = found.map((p) => p.distanceMeters!);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(ours.every((p) => p.newSince === null)).toBe(true);

    expect(await reader.candidates({ origin: { lat: -26.3, lon: -48.84 }, radiusMeters: 500, categories: ["infantil"], limit: 300 }).then((r) => r.filter((p) => names.includes(p.name)))).toEqual([]);
  });

  it("candidates sem origem: sem distância, e lugar de parceiro traz a data de novidade", async () => {
    const [{ id }] = await db<{ id: string }[]>`
      insert into places.places (source, name, category, location)
      values ('partner', ${`Novo Bar ${prefix}`}, 'bares', extensions.st_makepoint(-48.84, -26.3)::extensions.geography) returning id`;
    try {
      const found = await reader.candidates({ origin: null, radiusMeters: 0, categories: ["bares"], limit: 300 });
      const novo = found.find((p) => p.id === id);
      expect(novo?.distanceMeters).toBeNull();
      expect(novo?.newSince).toBeInstanceOf(Date);
    } finally {
      await db`delete from places.places where id = ${id}`;
    }
  });

  it("nearby: raio pequeno longe de tudo → vazio", async () => {
    expect(await reader.nearby({ lat: -26.85, lon: -49.5 }, 1000, 10)).toEqual([]);
  });

  it("usa o índice (não varre a tabela) para a página", async () => {
    const plan = await db.unsafe(`explain (format json) select id from places.places order by (name collate places.pt_br), id limit 21`);
    expect(JSON.stringify(plan)).toContain("places_name_id_idx");
  });
});
