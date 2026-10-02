import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { NewAdminPlace } from "../features/create-place/create-place";
import { PostgresPlaceOwnershipRepository } from "./postgres-place-ownership-repository";

const db = sql();
const repo = new PostgresPlaceOwnershipRepository(db);
const admin = crypto.randomUUID();
const partner = crypto.randomUUID();

const place: NewAdminPlace = {
  name: `Bar do Backoffice ${Date.now()}`,
  category: "bares",
  address: { street: "Rua do Príncipe", houseNumber: "100", neighborhood: "Centro" },
  phone: null,
  website: "https://exemplo.com.br/",
  location: { lat: -26.3045, lon: -48.8456 },
};

beforeAll(async () => {
  for (const id of [admin, partner]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`pc-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${admin}, 'admin'), (${partner}, 'partner')`;
});

afterAll(async () => {
  await db`delete from places.places where created_by in (${admin}, ${partner})`;
  await db`delete from auth.users where id in (${admin}, ${partner})`;
  await db.end();
});

describe("cadastro de estabelecimento pelo admin (#143)", () => {
  it("admin cadastra: origem 'admin', com quem cadastrou, na coordenada informada e sem responsável", async () => {
    const id = await repo.createByAdmin(admin, place);
    const [row] = await db<{ source: string; created_by: string; managed_by: string | null; lat: number; lon: number; protected: boolean }[]>`
      select source, created_by, managed_by, extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon,
             edited_by_partner_at is not null as protected
      from places.places where id = ${id}`;
    expect(row).toMatchObject({ source: "admin", created_by: admin, managed_by: null, protected: true });
    expect(row.lat).toBeCloseTo(-26.3045, 4);
    expect(row.lon).toBeCloseTo(-48.8456, 4);
    expect(await repo.summary(id)).toMatchObject({ name: place.name, managed: false });
  });

  it("quem não é admin não cadastra (RLS), nem um parceiro", async () => {
    await expect(repo.createByAdmin(partner, place)).rejects.toThrow(/row-level security/);
  });

  it("nem o admin insere como se fosse do OpenStreetMap ou em nome de outra pessoa", async () => {
    const insert = (source: string, createdBy: string) =>
      asUser(
        admin,
        (tx) => tx`insert into places.places (source, source_id, name, category, location, created_by)
                   values (${source}, ${`teste/${crypto.randomUUID()}`}, 'Forjado', 'bares', extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography, ${createdBy})`,
        db,
      );
    await expect(insert("osm", admin)).rejects.toThrow(/row-level security/);
    await expect(insert("admin", partner)).rejects.toThrow(/row-level security/);
  });
});
