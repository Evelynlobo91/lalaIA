import { BusinessRuleError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { targetKey, type Offer, type OfferDraft, type OfferRepository, type OfferTargets } from "../../domain/offer";

/** Parceiro aprovado (ids sempre da sessão). */
export type OfferAuthor = { userId: string; partnerId: string };

const LOCKED = "Esta oferta já foi resgatada: ela não pode mais ser editada, só encerrada.";
const isCheckViolation = (error: unknown) => String((error as { code?: string }).code) === "23514";

/** #30 — Criar ou editar oferta (editar só enquanto ninguém resgatou). */
export class SaveOffer {
  constructor(
    private readonly offers: OfferRepository,
    private readonly targets: OfferTargets,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(author: OfferAuthor, offerId: string | undefined, draft: OfferDraft): Promise<Result<Offer, DomainError>> {
    // Posse do lugar/evento pelas APIs públicas de places e events (a RLS não consulta outros schemas).
    const owned = new Set((await this.targets.ownedBy(author.userId)).map(targetKey));
    if (!owned.has(targetKey(draft.target))) {
      return err(new ValidationError("Lugar ou evento inválido.", [{ path: ["target"], message: "Escolha um lugar que você gerencia ou um evento seu que ainda não terminou." }]));
    }

    if (!offerId) {
      if (draft.endsAt <= this.now()) return err(new ValidationError("Data no passado.", [{ path: ["endsAt"], message: "O fim da oferta precisa estar no futuro." }]));
      return ok(await this.offers.create(author.userId, author.partnerId, draft));
    }

    const current = await this.offers.findById(offerId);
    // Oferta de outro parceiro: mesma resposta de inexistente.
    if (!current || current.partnerId !== author.partnerId) return err(new NotFoundError("Oferta"));
    if (current.status === "ended") return err(new BusinessRuleError("offer_ended", "Oferta encerrada não pode ser editada."));
    if (current.redeemedCount > 0) return err(new BusinessRuleError("offer_locked", LOCKED));

    try {
      const updated = await this.offers.update(author.userId, offerId, draft);
      return updated ? ok(updated) : err(new NotFoundError("Oferta"));
    } catch (error) {
      // Alguém resgatou entre a leitura e a gravação: o trigger do banco recusa.
      if (isCheckViolation(error)) return err(new BusinessRuleError("offer_locked", LOCKED));
      throw error;
    }
  }
}

/** Encerrar para novos resgates (definitivo). Códigos já emitidos continuam valendo até o fim da validade. Idempotente. */
export class EndOffer {
  constructor(private readonly offers: OfferRepository) {}

  async execute(author: OfferAuthor, offerId: string): Promise<Result<Offer, DomainError>> {
    const current = await this.offers.findById(offerId);
    if (!current || current.partnerId !== author.partnerId) return err(new NotFoundError("Oferta"));
    if (current.status === "ended") return ok(current);
    const ended = await this.offers.end(author.userId, offerId);
    return ended ? ok(ended) : err(new NotFoundError("Oferta"));
  }
}
