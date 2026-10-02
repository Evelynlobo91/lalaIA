// Composição do módulo billing (interna): usada pelas actions e pelo index.ts.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { GetPlan, ListPlans, PlanEntitlements, SavePlan, defaultPlanResolver } from "./features/plans/plans.use-cases";
import { PostgresPlanRepository } from "./infra/postgres-plan-repository";

export const planRepository = lazy(() => new PostgresPlanRepository(sql()));
export const savePlan = lazy(() => new SavePlan(planRepository()));
export const listPlans = lazy(() => new ListPlans(planRepository()));
export const getPlan = lazy(() => new GetPlan(planRepository()));

// Enquanto não há assinaturas (#153), todo parceiro está no plano padrão.
export const planEntitlements = lazy(() => new PlanEntitlements(defaultPlanResolver(planRepository())));
