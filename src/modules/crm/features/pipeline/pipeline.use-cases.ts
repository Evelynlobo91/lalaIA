import { z } from "zod";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { leadStages, type CrmActor, type Lead, type LeadRepository, type LeadStage } from "../../domain/lead";
import { canMove, type LeadPipeline, type StageChange } from "../../domain/pipeline";

const stages = leadStages.map((s) => s.id) as [LeadStage, ...LeadStage[]];

export const moveLeadSchema = z.object({
  leadId: z.uuid(),
  /** Etapa em que a pessoa viu o lead: se outra pessoa moveu antes, a mudança é recusada em vez de sobrescrever. */
  from: z.enum(stages),
  to: z.enum(stages, { error: "Escolha a etapa." }),
  reason: z
    .string()
    .trim()
    .max(500, "Use no máximo 500 caracteres.")
    .optional()
    .transform((v) => v || null),
});

/** Move o lead no funil (#148) e registra a mudança no histórico. Perdido exige motivo. */
export class MoveLead {
  constructor(
    private readonly leads: Pick<LeadRepository, "findById">,
    private readonly pipeline: Pick<LeadPipeline, "move">,
  ) {}

  async execute(actor: CrmActor, input: { leadId: string; from: LeadStage; to: LeadStage; reason: string | null }): Promise<Result<Lead, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    const lead = await this.leads.findById(actor.id, input.leadId);
    if (!lead) return err(new NotFoundError("Lead"));
    if (lead.stage !== input.from) return err(new ConflictError("Outra pessoa já moveu este lead. Atualize a página e tente de novo."));
    if (!canMove(lead.stage, input.to)) return err(new BusinessRuleError("invalid_stage_change", "Este lead não pode ir para essa etapa."));

    const lost = input.to === "perdido";
    if (lost && (!input.reason || input.reason.length < 5)) {
      return err(new ValidationError("Motivo obrigatório.", [{ path: ["reason"], message: "Explique por que o lead foi perdido (pelo menos 5 caracteres)." }]));
    }

    const moved = await this.pipeline.move(actor.id, lead.id, lead.stage, input.to, lost ? input.reason : null);
    return moved ? ok(moved) : err(new ConflictError("Outra pessoa já moveu este lead. Atualize a página e tente de novo."));
  }
}

export type StageChangeView = StageChange & { changedByName: string };

/** Histórico de etapas de um lead, com o nome de quem moveu. */
export class GetLeadHistory {
  constructor(
    private readonly pipeline: Pick<LeadPipeline, "history">,
    private readonly names: (ids: string[]) => Promise<Map<string, string>>,
  ) {}

  async execute(actor: CrmActor, leadId: string): Promise<Result<StageChangeView[], DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const changes = await this.pipeline.history(actor.id, leadId);
    const names = await this.names([...new Set(changes.flatMap((c) => (c.changedBy ? [c.changedBy] : [])))]);
    return ok(changes.map((c) => ({ ...c, changedByName: c.changedBy ? (names.get(c.changedBy) ?? "Conta removida") : "Conta removida" })));
  }
}
