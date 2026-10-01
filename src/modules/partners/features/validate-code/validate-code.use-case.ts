import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { formatDateTime } from "@/shared/time/joinville-time";
import "../../domain/events";
import { normalizeOfferCode } from "../../domain/offer-code";
import type { RedemptionRepository } from "../../domain/offer";
import type { OfferAuthor } from "../manage-offers/manage-offers.use-cases";

export const validateCodeSchema = z.object({ code: z.string().trim().min(1, "Digite o código.").max(20, "Código inválido.") });

export type ValidatedCode = { code: string; offerId: string; offerTitle: string; redeemedAt: Date; validatedAt: Date };

/**
 * #30 — Parceiro valida no balcão o código que o explorador mostra. Só vale para ofertas do próprio
 * parceiro e uma vez só. Código de outra oferta (de outro parceiro) recebe a mesma resposta de um código
 * inexistente ("Código inválido."), para não revelar que ele existe.
 */
export class ValidateOfferCode {
  constructor(
    private readonly redemptions: RedemptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(author: OfferAuthor, rawCode: string): Promise<Result<ValidatedCode, DomainError>> {
    const invalid = err(new BusinessRuleError("invalid_code", "Código inválido."));
    const code = normalizeOfferCode(rawCode);
    if (!code) return invalid;

    const found = await this.redemptions.findForPartner(author.userId, author.partnerId, code);
    if (!found) return invalid;
    if (found.validatedAt) return err(new BusinessRuleError("code_used", `Este código já foi usado em ${formatDateTime(found.validatedAt)}.`));
    if (this.now() >= found.offer.endsAt) return err(new BusinessRuleError("code_expired", `Esta oferta terminou em ${formatDateTime(found.offer.endsAt)}: o código não vale mais.`));

    // Uma vez só, mesmo com duas validações ao mesmo tempo (update condicional + RLS).
    const validated = await this.redemptions.markValidated(author.userId, found.id);
    if (!validated?.validatedAt) return err(new BusinessRuleError("code_used", "Este código já foi usado."));

    await this.events.publish("partners.OfferValidated", {
      offerId: found.offerId,
      redemptionId: found.id,
      userId: found.userId,
      validatedBy: author.userId,
      targetType: found.offer.target.type,
      targetId: found.offer.target.id,
    });
    return ok({ code, offerId: found.offerId, offerTitle: found.offer.title, redeemedAt: found.redeemedAt, validatedAt: validated.validatedAt });
  }
}
