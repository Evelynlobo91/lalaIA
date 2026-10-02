import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import { planFeatureIds, type Plan, type PlanCatalog, type PlanData, type PlanFeature, type PlanRepository } from "../domain/plan";

type Row = { id: string; code: string; name: string; description: string; price_cents: number; features: string[]; is_default: boolean; active: boolean };

export const PLAN_COLUMNS = "id, code, name, description, price_cents, features, is_default, active";

export const toPlan = (r: Row): Plan => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  priceCents: r.price_cents,
  // Na ordem do catálogo; recurso que saiu do catálogo é ignorado.
  features: planFeatureIds.filter((f) => r.features.includes(f)) as PlanFeature[],
  isDefault: r.is_default,
  active: r.active,
});

export type { Row as PlanRow };

const UNIQUE_VIOLATION = "23505";
const isCodeTaken = (error: unknown) => (error as { code?: string; constraint_name?: string }).code === UNIQUE_VIOLATION && (error as { constraint_name?: string }).constraint_name === "plans_code_key";

export class PostgresPlanRepository implements PlanRepository, PlanCatalog {
  constructor(private readonly sql: Sql) {}

  private as<T>(actorId: string, fn: (tx: Tx) => Promise<T>) {
    return asUser(actorId, fn, this.sql);
  }

  async list(actorId: string): Promise<Plan[]> {
    const rows = await this.as(actorId, (tx) => tx.unsafe<Row[]>(`select ${PLAN_COLUMNS} from billing.plans order by price_cents, name`));
    return rows.map(toPlan);
  }

  async findById(actorId: string, planId: string): Promise<Plan | null> {
    const [row] = await this.as(actorId, (tx) => tx.unsafe<Row[]>(`select ${PLAN_COLUMNS} from billing.plans where id = $1`, [planId]));
    return row ? toPlan(row) : null;
  }

  async create(actorId: string, d: PlanData): Promise<Plan | null> {
    try {
      return await this.as(actorId, async (tx) => {
        // Só um padrão por vez: o anterior deixa de ser antes de o novo entrar (índice único parcial).
        if (d.isDefault) await tx`update billing.plans set is_default = false where is_default`;
        const [row] = await tx.unsafe<Row[]>(
          `insert into billing.plans (code, name, description, price_cents, features, is_default, active) values ($1, $2, $3, $4, $5::text[], $6, $7) returning ${PLAN_COLUMNS}`,
          [d.code, d.name, d.description, d.priceCents, d.features, d.isDefault, d.active],
        );
        return toPlan(row);
      });
    } catch (error) {
      if (isCodeTaken(error)) return null;
      throw error;
    }
  }

  async update(actorId: string, planId: string, d: PlanData): Promise<Plan | "code_taken" | null> {
    try {
      return await this.as(actorId, async (tx) => {
        if (d.isDefault) await tx`update billing.plans set is_default = false where is_default and id <> ${planId}`;
        const [row] = await tx.unsafe<Row[]>(
          `update billing.plans set code = $2, name = $3, description = $4, price_cents = $5, features = $6::text[], is_default = $7, active = $8 where id = $1 returning ${PLAN_COLUMNS}`,
          [planId, d.code, d.name, d.description, d.priceCents, d.features, d.isDefault, d.active],
        );
        return row ? toPlan(row) : null;
      });
    } catch (error) {
      if (isCodeTaken(error)) return "code_taken";
      throw error;
    }
  }

  // Sistema (sem asUser): quem pergunta o plano de um parceiro é outro módulo, não uma pessoa do financeiro.
  async defaultPlan(): Promise<Plan | null> {
    const [row] = await this.sql.unsafe<Row[]>(`select ${PLAN_COLUMNS} from billing.plans where is_default`);
    return row ? toPlan(row) : null;
  }
}
