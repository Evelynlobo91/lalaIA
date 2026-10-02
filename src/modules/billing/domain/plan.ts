/** Recursos que um plano pode liberar. Um recurso novo entra aqui e no check de `billing.plans.features`. */
export const planFeatures = [
  { id: "live", label: "Live", description: "Transmissão ao vivo do lugar ou do evento." },
  { id: "missoes", label: "Missões", description: "Missões e recompensas para atrair exploradores." },
  { id: "ofertas", label: "Ofertas", description: "Descontos e promoções com resgate por código." },
  { id: "destaque", label: "Destaque", description: "Destaque patrocinado na descoberta." },
  { id: "cta", label: "CTAs na live", description: "Chamadas para ação programadas sobre a live." },
  { id: "chat", label: "Chat na live", description: "Chat e reações durante a live." },
] as const;

export type PlanFeature = (typeof planFeatures)[number]["id"];

export const planFeatureIds = planFeatures.map((f) => f.id) as [PlanFeature, ...PlanFeature[]];
export const featureLabel = (id: PlanFeature) => planFeatures.find((f) => f.id === id)!.label;

/** Dados editáveis de um plano. */
export type PlanData = {
  code: string;
  name: string;
  description: string;
  /** Mensalidade em centavos (0 = gratuito). */
  priceCents: number;
  features: PlanFeature[];
  /** Plano de quem não tem assinatura. Só um por vez. */
  isDefault: boolean;
  /** Inativo não aceita novas assinaturas. */
  active: boolean;
};

export type Plan = PlanData & { id: string };

/** "R$ 149,00/mês" ou "Gratuito". */
export function formatPlanPrice(priceCents: number): string {
  return priceCents === 0 ? "Gratuito" : `${(priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`;
}

/** Quem age na cobrança. As capacidades vêm do papel (#157) e são conferidas de novo em cada caso de uso. */
export type BillingActor = { id: string; canRead: boolean; canWrite: boolean };

/** Gestão dos planos. `actorId` vem da sessão; as consultas rodam "como ele" sob RLS. */
export interface PlanRepository {
  list(actorId: string): Promise<Plan[]>;
  findById(actorId: string, planId: string): Promise<Plan | null>;
  /** Cria o plano; se for o novo padrão, o anterior deixa de ser, na mesma transação. null se o código já existe. */
  create(actorId: string, data: PlanData): Promise<Plan | null>;
  /** Idem para a edição. null se o plano não existe; "code_taken" se o código já é de outro plano. */
  update(actorId: string, planId: string, data: PlanData): Promise<Plan | "code_taken" | null>;
}

/** Leitura do plano que vale para um parceiro, sem RLS (quem pergunta é o sistema, não uma pessoa). */
export interface PlanCatalog {
  /** O plano padrão (de quem não tem assinatura). */
  defaultPlan(): Promise<Plan | null>;
}
