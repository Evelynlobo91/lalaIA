import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresPreferencesRepository } from "./postgres-preferences-repository";
import { PostgresProfileRepository } from "./postgres-profile-repository";

const db = sql();
const userA = crypto.randomUUID();
const userB = crypto.randomUUID();

async function createUser(id: string) {
  await db`insert into auth.users (id, email, raw_user_meta_data)
           values (${id}, ${`int-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09", display_name: "Int" })})`;
}

beforeAll(async () => {
  await createUser(userA);
  await createUser(userB);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${userA}, ${userB})`;
  await db.end();
});

describe("PostgresPreferencesRepository", () => {
  const repo = new PostgresPreferencesRepository(db);

  it("sem preferências salvas → null", async () => {
    expect(await repo.find(userA)).toBeNull();
  });

  it("salva e atualiza (upsert) sem afetar outro usuário", async () => {
    await repo.save(userA, { categories: ["cultura"], budgetMax: 50, radiusKm: 5, groupSize: "casal" });
    await repo.save(userA, { categories: ["bares", "shows"], budgetMax: null, radiusKm: 20, groupSize: null });

    expect(await repo.find(userA)).toEqual({ categories: ["bares", "shows"], budgetMax: null, radiusKm: 20, groupSize: null });
    expect(await repo.find(userB)).toBeNull();
  });

  it("ignora na leitura categorias que saíram do catálogo", async () => {
    await db`update identity.preferences set categories = array['cultura', 'categoria-antiga'] where user_id = ${userA}`;
    expect((await repo.find(userA))?.categories).toEqual(["cultura"]);
  });

  it("o banco recusa valores fora das regras (defesa em profundidade)", async () => {
    await expect(repo.save(userB, { categories: [], budgetMax: -1, radiusKm: 10, groupSize: null })).rejects.toThrow();
    await expect(repo.save(userB, { categories: [], budgetMax: null, radiusKm: 999, groupSize: null })).rejects.toThrow();
  });
});

describe("PostgresProfileRepository", () => {
  const repo = new PostgresProfileRepository(db);

  it("atualiza o nome", async () => {
    await repo.updateDisplayName(userA, "Novo Nome");
    expect((await repo.find(userA))?.displayName).toBe("Novo Nome");
  });

  it("troca a foto devolvendo o caminho anterior", async () => {
    expect(await repo.replaceAvatar(userA, `${userA}/1.png`)).toBeNull();
    expect(await repo.replaceAvatar(userA, `${userA}/2.png`)).toBe(`${userA}/1.png`);
    expect((await repo.find(userA))?.avatarPath).toBe(`${userA}/2.png`);
  });
});

// Políticas do Storage só existem com o schema storage (Supabase completo). No CI de integração, só há Postgres.
const [{ hasStorage }] = await db<{ hasStorage: boolean }[]>`select to_regclass('storage.objects') is not null as "hasStorage"`;

describe.skipIf(!hasStorage)("políticas do Storage para avatares", () => {
  // Executa um insert como o papel `authenticated` do usuário `sub`, igual à API do Supabase faz.
  async function insertAs(sub: string, name: string) {
    return db
      .begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        await tx`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', ${name}, ${sub})`;
        throw { rollback: "ok" };
      })
      .catch((e) => (e?.rollback === "ok" ? "permitido" : "negado"));
  }

  it("dono grava na própria pasta", async () => {
    expect(await insertAs(userA, `${userA}/foto.png`)).toBe("permitido");
  });

  it("não grava na pasta de outra pessoa", async () => {
    expect(await insertAs(userA, `${userB}/foto.png`)).toBe("negado");
  });

  it("não grava fora de uma pasta de usuário", async () => {
    expect(await insertAs(userA, "foto.png")).toBe("negado");
  });
});
