import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import type { PartnerApplication, PartnerRepository } from "../../domain/partner";
import type { ApplyInput } from "./apply.schema";

/** RNF05 — Pedido para ser parceiro (estabelecimento ou promotor). Fica pendente até um admin revisar. */
export class SubmitPartnerApplication {
  constructor(private readonly partners: PartnerRepository) {}

  async execute(actorId: string, input: ApplyInput): Promise<Result<PartnerApplication, BusinessRuleError>> {
    const current = await this.partners.findByOwner(actorId);
    if (current?.status === "approved") {
      return err(new BusinessRuleError("already_partner", "Seu cadastro de parceiro já foi aprovado."));
    }
    // Novo cadastro, correção enquanto pendente ou reenvio após recusa: volta para a fila como pendente.
    return ok(await this.partners.submit(actorId, input));
  }
}
