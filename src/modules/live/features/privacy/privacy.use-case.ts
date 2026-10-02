import { BusinessRuleError, ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { LIVE_GUIDELINES_VERSION, isCurrent, type PrivacyAgreement, type PrivacyAgreements } from "../../domain/privacy";
import type { LiveActor } from "../../domain/stream";

/** RNF16/RNF17 — O parceiro aceita as diretrizes de privacidade (checklist). Fica registrado com a data. */
export class AcceptLiveGuidelines {
  constructor(private readonly agreements: PrivacyAgreements) {}

  async execute(actor: LiveActor): Promise<Result<PrivacyAgreement, DomainError>> {
    if (!actor.isPartner) return err(new ForbiddenError("Só parceiros transmitem ao vivo."));
    const current = await this.agreements.find(actor.id);
    if (isCurrent(current)) return ok(current);
    const accepted = await this.agreements.accept(actor.id, LIVE_GUIDELINES_VERSION);
    return accepted ? ok(accepted) : err(new ForbiddenError("Só parceiros transmitem ao vivo."));
  }
}

/**
 * Trava usada pelos casos de uso que colocam uma live no ar (gerar a chave, ativar): sem o aceite da
 * versão vigente das diretrizes, recusa com uma mensagem clara.
 */
export class PrivacyGate {
  constructor(private readonly agreements: Pick<PrivacyAgreements, "find">) {}

  /** Data do aceite vigente do usuário, ou null (portal). */
  async acceptedAt(userId: string): Promise<Date | null> {
    const agreement = await this.agreements.find(userId);
    return isCurrent(agreement) ? agreement.acceptedAt : null;
  }

  /** ok se o dono da transmissão aceitou as diretrizes vigentes. */
  async check(ownerId: string, action: "provision" | "activate"): Promise<Result<true, DomainError>> {
    if (await this.acceptedAt(ownerId)) return ok(true);
    const what = action === "provision" ? "gerar a chave de transmissão" : "ativar a transmissão";
    return err(new BusinessRuleError("privacy_guidelines_required", `Aceite as diretrizes de privacidade da live antes de ${what}.`));
  }
}
