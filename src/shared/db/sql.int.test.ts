import { afterAll, describe, expect, it } from "vitest";
import { sql } from "./sql";

const db = sql();

afterAll(() => db.end());

describe("banco local (Supabase)", () => {
  it("tem PostGIS habilitado e calcula distância geográfica", async () => {
    // Centro de Joinville → Expoville: ~3 km
    const [row] = await db`
      select extensions.st_distance(
        extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography,
        extensions.st_makepoint(-48.8157, -26.2893)::extensions.geography
      ) as metros`;
    expect(row.metros).toBeGreaterThan(3000);
    expect(row.metros).toBeLessThan(4000);
  });

  it("tem unaccent para busca sem acento", async () => {
    const [row] = await db`select extensions.unaccent('Joinville É ótima') as t`;
    expect(row.t).toBe("Joinville E otima");
  });

  it("platform.set_updated_at atualiza updated_at", async () => {
    const updatedAt = await db.begin(async (tx) => {
      await tx`create temp table t (id int primary key, updated_at timestamptz not null default '2000-01-01') on commit drop`;
      await tx`create trigger t_updated before update on t for each row execute function platform.set_updated_at()`;
      await tx`insert into t (id) values (1)`;
      await tx`update t set id = 1`;
      const [row] = await tx`select updated_at from t`;
      return new Date(row.updated_at);
    });
    expect(updatedAt.getFullYear()).toBeGreaterThan(2000);
  });

  it("schema platform não é acessível pelos papéis públicos da API", async () => {
    const [row] = await db`select has_schema_privilege('anon', 'platform', 'usage') as anon_usage`;
    expect(row.anon_usage).toBe(false);
  });
});
