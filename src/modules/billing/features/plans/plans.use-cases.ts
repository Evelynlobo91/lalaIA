import { z } from "zod";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { planFeatureIds, type BillingActor, type Plan, type PlanCatalog, type PlanData, type PlanFeature, type PlanRepository } from "../../domain/plan";

export const planSchema = z
  .object({
    planId: z.uuid().optional(),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9-]{1,29}$/, "Use de 2 a 30 letras minúsculas, números ou hífen, começando por letra."),
    name: z.string().trim().min(2, "Informe o nome do plano.").max(60, "Use no máximo 60 caracteres."),
    description: z.string().trim().max(300, "Use no máximo 300 caracteres."),
    // "149", "149,90", "1.249,00" ou "149.90" → centavos. Vazio = gratuito.
    price: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return 0;
        // Com vírgula, o ponto é separador de milhar; sem vírgula, "149.90" é decimal.
        const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(v) ? v : v.replace(/\./g, "");
        const reais = /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
        if (!Number.isFinite(reais)) {
          ctx.addIssue({ code: "custom", message: "Informe um valor em reais, sem sinal." });
          return z.NEVER;
        }
        if (reais > 100000) {
          ctx.addIssue({ code: "custom", message: "Valor alto demais." });
          return z.NEVER;
        }
        return Math.round(reais * 100);
      }),
    features: z.array(z.enum(planFeatureIds)).default([]),
    isDefault: z.literal("on").optional(),
    active: z.literal("on").optional(),
  })
  .transform(({ planId, price, isDefault, active, features, ...rest }): { planId: string | undefined; data: PlanData } => ({
    planId,
    // Sem repetição e na ordem do catálogo: o mesmo conjunto gera sempre a mesma lista.
    data: { ...rest, priceCents: price, features: planFeatureIds.filter((f) => features.includes(f)), isDefault: isDefault === "on", active: active === "on" },
  }));

/** Cria ou edita um plano (#152). Sempre existe um plano padrão, e ele precisa estar ativo. */
export class SavePlan {
  constructor(private readonly plans: Pick<PlanRepository, "create" | "update" | "findById">) {}

  async execute(actor: BillingActor, planId: string | undefined, data: PlanData): Promise<Result<Plan, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    if (data.isDefault && !data.active) return err(new BusinessRuleError("default_plan_inactive", "O plano padrão precisa estar ativo."));

    if (!planId) {
      const created = await this.plans.create(actor.id, data);
      return created ? ok(created) : err(new ConflictError("Já existe um plano com esse código."));
    }

    const current = await this.plans.findById(actor.id, planId);
    if (!current) return err(new NotFoundError("Plano"));
    // Tirar o padrão de um plano deixaria a plataforma sem plano padrão: marque outro como padrão em vez disso.
    if (current.isDefault && !data.isDefault) return err(new BusinessRuleError("default_plan_required", "Para trocar o plano padrão, marque outro plano como padrão."));

    const updated = await this.plans.update(actor.id, planId, data);
    if (updated === "code_taken") return err(new ConflictError("Já existe um plano com esse código."));
    return updated ? ok(updated) : err(new NotFoundError("Plano"));
  }
}

/** Planos para o backoffice: o padrão primeiro, depois por preço. */
export class ListPlans {
  constructor(private readonly plans: Pick<PlanRepository, "list">) {}

  async execute(actor: BillingActor): Promise<Result<Plan[], DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const plans = await this.plans.list(actor.id);
    return ok([...plans].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.priceCents - b.priceCents || a.name.localeCompare(b.name, "pt-BR")));
  }
}

/** Um plano, para o formulário de edição. */
export class GetPlan {
  constructor(private readonly plans: Pick<PlanRepository, "findById">) {}

  async execute(actor: BillingActor, planId: string): Promise<Result<Plan, DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const plan = await this.plans.findById(actor.id, planId);
    return plan ? ok(plan) : err(new NotFoundError("Plano"));
  }
}

/** Plano que vale para um dono de conteúdo. Hoje: o padrão; com assinaturas (#153), o plano assinado. */
export type PlanResolver = (ownerId: string) => Promise<Plan | null>;

/**
 * Porta pública do módulo (#152): "este parceiro tem direito a live?". Os outros módulos consultam por aqui,
 * sem conhecer tabelas de cobrança.
 */
export class PlanEntitlements {
  constructor(private readonly planOf: PlanResolver) {}

  async featuresOf(ownerId: string): Promise<PlanFeature[]> {
    return (await this.planOf(ownerId))?.features ?? [];
  }

  async has(ownerId: string, feature: PlanFeature): Promise<boolean> {
    return (await this.featuresOf(ownerId)).includes(feature);
  }
}

/** Enquanto não há assinaturas, todo parceiro está no plano padrão. */
export const defaultPlanResolver =
  (catalog: PlanCatalog): PlanResolver =>
  () =>
    catalog.defaultPlan();
