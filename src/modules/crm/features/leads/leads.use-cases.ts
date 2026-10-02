import { ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { CrmActor, Lead, LeadData, LeadOwners, LeadRepository } from "../../domain/lead";

export const LEADS_LIST_LIMIT = 200;

/** Cadastra ou edita um lead (#147). O responsável precisa ser alguém do time que cuida de leads. */
export class SaveLead {
  constructor(
    private readonly leads: Pick<LeadRepository, "create" | "update">,
    private readonly owners: LeadOwners,
  ) {}

  async execute(actor: CrmActor, leadId: string | undefined, data: LeadData): Promise<Result<Lead, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    if (!(await this.owners.list()).some((o) => o.id === data.ownerId)) {
      return err(new ValidationError("Responsável inválido.", [{ path: ["ownerId"], message: "Escolha alguém do time comercial." }]));
    }
    if (!leadId) return ok(await this.leads.create(actor.id, data));

    const updated = await this.leads.update(actor.id, leadId, data);
    return updated ? ok(updated) : err(new NotFoundError("Lead"));
  }
}

export type LeadListItem = Lead & { ownerName: string };

/** Lista de leads com o nome do responsável. */
export class ListLeads {
  constructor(
    private readonly leads: Pick<LeadRepository, "list">,
    private readonly owners: LeadOwners,
  ) {}

  async execute(actor: CrmActor): Promise<Result<LeadListItem[], DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const [leads, owners] = await Promise.all([this.leads.list(actor.id, LEADS_LIST_LIMIT), this.owners.list()]);
    const names = new Map(owners.map((o) => [o.id, o.name]));
    // Conta excluída → sem responsável; quem saiu do time comercial continua aparecendo, sem nome.
    return ok(leads.map((lead) => ({ ...lead, ownerName: lead.ownerId === null ? "Sem responsável" : (names.get(lead.ownerId) ?? "Fora do time") })));
  }
}

/** Um lead, para a tela de edição. */
export class GetLead {
  constructor(private readonly leads: Pick<LeadRepository, "findById">) {}

  async execute(actor: CrmActor, leadId: string): Promise<Result<Lead, DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const lead = await this.leads.findById(actor.id, leadId);
    return lead ? ok(lead) : err(new NotFoundError("Lead"));
  }
}
