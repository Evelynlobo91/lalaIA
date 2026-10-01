import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { PlaceDraft } from "../domain/place";
import { ImportOsmPlaces } from "../features/import-osm/import-osm.use-case";
import { FileOsmSource } from "./osm-sources";
import { PostgresPlaceImportRepository } from "./postgres-place-import-repository";

const db = sql();
const repo = new PostgresPlaceImportRepository(db);
const prefix = `teste-${Date.now()}`;

const draft = (n: number, patch: Partial<PlaceDraft> = {}): PlaceDraft => ({
  source: "osm",
  sourceId: `${prefix}/${n}`,
  name: `Lugar ${n}`,
  category: "bares",
  address: { street: "Rua do Príncipe", houseNumber: "1", neighborhood: "Centro", postcode: null, city: "Joinville" },
  phone: null,
  website: null,
  openingHours: null,
  location: { lat: -26.3045, lon: -48.8456 },
  ...patch,
});

afterAll(async () => {
  await db`delete from places.places where source_id like ${`${prefix}/%`}`;
  await db.end();
});

describe("PostgresPlaceImportRepository", () => {
  it("insere, não duplica e só atualiza o que mudou (idempotente)", async () => {
    expect(await repo.upsertMany([draft(1), draft(2)])).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(await repo.upsertMany([draft(1), draft(2)])).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(await repo.upsertMany([draft(1, { name: "Lugar 1 renomeado" }), draft(2)])).toEqual({ inserted: 0, updated: 1, unchanged: 1 });

    const [row] = await db`select name, extensions.st_y(location::extensions.geometry) as lat from places.places where source_id = ${`${prefix}/1`}`;
    expect(row).toEqual({ name: "Lugar 1 renomeado", lat: -26.3045 });
  });

  it("não sobrescreve lugar editado por parceiro", async () => {
    await repo.upsertMany([draft(3)]);
    await db`update places.places set name = 'Nome do parceiro', edited_by_partner_at = now() where source_id = ${`${prefix}/3`}`;

    expect(await repo.upsertMany([draft(3, { name: "Nome do OSM" })])).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    const [row] = await db`select name from places.places where source_id = ${`${prefix}/3`}`;
    expect(row.name).toBe("Nome do parceiro");
  });

  it("o banco recusa site que não seja http(s), mesmo se o código deixar passar", async () => {
    await expect(repo.upsertMany([draft(4, { website: "javascript:alert(1)" })])).rejects.toThrow(/website/);
  });

  it("schema places não é acessível pelos papéis públicos da API", async () => {
    const [row] = await db`select has_schema_privilege('anon', 'places', 'usage') as anon, has_schema_privilege('authenticated', 'places', 'usage') as auth`;
    expect(row).toEqual({ anon: false, auth: false });
  });
});

describe("importação do snapshot de Joinville (seed)", () => {
  it("todos os lugares do snapshot são válidos e importáveis", async () => {
    const snapshot = new FileOsmSource(join(process.cwd(), "supabase", "seed-data", "osm-joinville.json"));
    const captured: PlaceDraft[] = [];
    const report = await new ImportOsmPlaces(snapshot, { upsertMany: async (d) => (captured.push(...d), { inserted: d.length, updated: 0, unchanged: 0 }) }).execute();

    expect(report.fetched).toBeGreaterThan(400);
    expect(report.inserted).toBeGreaterThan(400);
    expect(new Set(captured.map((d) => d.category)).size).toBeGreaterThanOrEqual(10);
    expect(captured.every((d) => d.location.lat < -26 && d.location.lon < -48)).toBe(true);
  });
});
