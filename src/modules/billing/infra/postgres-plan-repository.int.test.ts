import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { PlanData } from "../domain/plan";
import { PostgresPlanRepository } from "./postgres-plan-repository";

const db = sql();
const repo = new PostgresPlanRepository(db);
const finance = crypto.randomUUID();
const commercial = crypto.randomUUID();
const tag = `t${Date.now()}`;

const data = (patch: Partial<PlanData> = {}): PlanData => ({ code: `${tag}-pro`, name: `Pro ${tag}`, description: "Plano de teste.", priceCents: 9900, features: ["live", "destaque"], isDefault: false, active: true, ...patch });

let originalDefault: string;

beforeAll(async () => {
  for (const [id, role] of [[finance, "finance"], [commercial, "commercial"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${role}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  originalDefault = (await repo.defaultPlan())!.id;
});

afterAll(async () => {
  // Devolve o padrão original e apaga os planos de teste.
  await db`update billing.plans set is_default = false where is_default and id <> ${originalDefault}`;
  await db`update billing.plans set is_default = true where id = ${originalDefault}`;
  await db`delete from billing.plans where code like ${`${tag}-%`}`;
  await db`delete from auth.users where id in (${finance}, ${commercial})`;
  await db.end();
});

describe("PostgresPlanRepository (#152)", () => {
  it("os planos iniciais existem: Básico é o padrão e libera o que já existia (live, missões, ofertas)", async () => {
    const plans = await repo.list(finance);
    expect(plans.find((p) => p.code === "basico")).toMatchObject({ isDefault: true, active: true, priceCents: 0, features: ["live", "missoes", "ofertas"] });
    expect(plans.find((p) => p.code === "pro")?.features).toEqual(["live", "missoes", "ofertas", "destaque", "cta", "chat"]);
    expect((await repo.defaultPlan())?.code).toBe("basico");
  });

  it("financeiro cria e edita; os recursos voltam na ordem do catálogo", async () => {
    const created = await repo.create(finance, data({ features: ["destaque", "live"] }));
    expect(created).toMatchObject({ code: `${tag}-pro`, priceCents: 9900, features: ["live", "destaque"], isDefault: false });

    const updated = await repo.update(finance, created!.id, data({ name: `Pro Plus ${tag}`, priceCents: 19900, features: ["chat"] }));
    expect(updated).toMatchObject({ name: `Pro Plus ${tag}`, priceCents: 19900, features: ["chat"] });
    expect((await repo.findById(finance, created!.id))?.priceCents).toBe(19900);
  });

  it("código repetido: null na criação e 'code_taken' na edição", async () => {
    expect(await repo.create(finance, data())).toBeNull();
    const other = await repo.create(finance, data({ code: `${tag}-outro` }));
    expect(await repo.update(finance, other!.id, data())).toBe("code_taken");
    expect(await repo.update(finance, crypto.randomUUID(), data({ code: `${tag}-nada` }))).toBeNull();
  });

  it("marcar um plano como padrão tira o padrão do anterior, na mesma transação", async () => {
    const [mine] = (await repo.list(finance)).filter((p) => p.code === `${tag}-pro`);
    expect(await repo.update(finance, mine.id, data({ isDefault: true }))).toMatchObject({ isDefault: true });
    const defaults = (await repo.list(finance)).filter((p) => p.isDefault);
    expect(defaults.map((p) => p.code)).toEqual([`${tag}-pro`]);
    expect((await repo.defaultPlan())?.code).toBe(`${tag}-pro`);

    // E um plano novo já criado como padrão também.
    await repo.create(finance, data({ code: `${tag}-novo`, isDefault: true }));
    expect((await repo.list(finance)).filter((p) => p.isDefault).map((p) => p.code)).toEqual([`${tag}-novo`]);
  });

  it("o banco recusa padrão inativo, recurso fora do catálogo e preço negativo", async () => {
    await expect(repo.create(finance, data({ code: `${tag}-a`, isDefault: true, active: false }))).rejects.toThrow(/check/);
    await expect(repo.create(finance, data({ code: `${tag}-b`, features: ["voar" as "live"] }))).rejects.toThrow(/check/);
    await expect(repo.create(finance, data({ code: `${tag}-c`, priceCents: -1 }))).rejects.toThrow(/check/);
    // A tentativa que falhou não deixou a plataforma sem plano padrão.
    expect((await repo.defaultPlan())?.code).toBe(`${tag}-novo`);
  });

  it("quem não é do financeiro não lê nem altera planos (RLS)", async () => {
    expect(await repo.list(commercial)).toHaveLength(0);
    await expect(repo.create(commercial, data({ code: `${tag}-x` }))).rejects.toThrow(/row-level security/);
    const [mine] = (await repo.list(finance)).filter((p) => p.code === `${tag}-pro`);
    expect(await repo.update(commercial, mine.id, data({ name: "Invadido" }))).toBeNull();
    expect((await repo.findById(finance, mine.id))?.name).not.toBe("Invadido");
  });
});
