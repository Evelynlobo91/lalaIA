import { z } from "zod";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { offerTargetTypes, targetKey, type OfferTarget, type OfferTargets } from "../../domain/offer";

/** Períodos de destaque que o parceiro pode contratar (dias a partir de agora). */
export const sponsorshipDays = [7, 15, 30] as const;
/** Destaques ativos ao mesmo tempo por parceiro. */
export const MAX_ACTIVE_SPONSORSHIPS = 3;

export type Sponsorship = { id: string; partnerId: string; target: OfferTarget; startsAt: Date; endsAt: Date; status: "active" | "ended" };

/** Quem contrata: a conta (id da sessão) e o cadastro de parceiro aprovado dela. */
export type Sponsor = { userId: string; partnerId: string };

export const startSponsorshipSchema = z
  .object({
    // "place:<uuid>" ou "event:<uuid>", como no formulário de ofertas.
    target: z.string().regex(new RegExp(`^(${offerTargetTypes.join("|")}):[0-9a-f-]{36}$`, "i"), "Escolha o que destacar."),
    days: z.coerce.number().refine((v) => (sponsorshipDays as readonly number[]).includes(v), "Escolha o período."),
  })
  .transform(({ target, days }) => {
    const [type, id] = target.split(":");
    return { target: { type: type as OfferTarget["type"], id: id.toLowerCase() }, days };
  });

export const sponsorshipIdSchema = z.object({ sponsorshipId: z.uuid() });

/** Persistência dos destaques. `actorId` vem da sessão; as consultas do parceiro rodam "como ele" sob RLS. */
export interface SponsorshipRepository {
  /** null se o alvo já tem um destaque ativo (de qualquer parceiro). */
  create(actorId: string, partnerId: string, target: OfferTarget, startsAt: Date, endsAt: Date): Promise<Sponsorship | null>;
  listByPartner(actorId: string, partnerId: string): Promise<Sponsorship[]>;
  /** Encerra o destaque do parceiro; null se não existe, não é dele ou já estava encerrado. */
  end(actorId: string, partnerId: string, sponsorshipId: string): Promise<Sponsorship | null>;
  /** Sistema: alvos (`place:id`, `event:id`) com destaque valendo agora, de parceiros aprovados. */
  activeKeys(now: Date): Promise<string[]>;
  /** Sistema: encerra todos os destaques ativos de uma conta (ex.: perdeu o direito no plano). */
  endAllOf(ownerId: string): Promise<number>;
}

/** O plano da conta libera o destaque? (porta implementada pela API pública do módulo billing) */
export type VisibilityEntitlement = (ownerId: string) => Promise<boolean>;

const DAY_MS = 86_400_000;
const stillRunning = (s: Sponsorship, now: Date) => s.status === "active" && s.endsAt > now;

/**
 * O parceiro contrata o destaque de um lugar que gerencia ou de um evento que criou, por um período (#29).
 * O direito vem do plano (recurso `destaque`); não há cobrança avulsa.
 */
export class StartSponsorship {
  constructor(
    private readonly sponsorships: Pick<SponsorshipRepository, "create" | "listByPartner">,
    private readonly targets: Pick<OfferTargets, "ownedBy">,
    private readonly entitled: VisibilityEntitlement,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(sponsor: Sponsor, target: OfferTarget, days: number): Promise<Result<Sponsorship, DomainError>> {
    if (!(await this.entitled(sponsor.userId))) {
      return err(new BusinessRuleError("plan_feature_required", "O plano atual não inclui destaque. Mude de plano em Assinatura para destacar o seu negócio."));
    }
    const owned = await this.targets.ownedBy(sponsor.userId);
    if (!owned.some((t) => targetKey(t) === targetKey(target))) {
      return err(new ValidationError("Alvo inválido.", [{ path: ["target"], message: "Escolha um lugar que você gerencia ou um evento seu que ainda não terminou." }]));
    }

    const now = this.now();
    const running = (await this.sponsorships.listByPartner(sponsor.userId, sponsor.partnerId)).filter((s) => stillRunning(s, now));
    if (running.some((s) => targetKey(s.target) === targetKey(target))) return err(new ConflictError("Este lugar ou evento já está em destaque."));
    if (running.length >= MAX_ACTIVE_SPONSORSHIPS) {
      return err(new BusinessRuleError("too_many_sponsorships", `Você pode ter até ${MAX_ACTIVE_SPONSORSHIPS} destaques ao mesmo tempo. Encerre um para destacar outro.`));
    }

    const created = await this.sponsorships.create(sponsor.userId, sponsor.partnerId, target, now, new Date(now.getTime() + days * DAY_MS));
    return created ? ok(created) : err(new ConflictError("Este lugar ou evento já está em destaque."));
  }
}

/** Encerra um destaque antes do fim do período. */
export class EndSponsorship {
  constructor(private readonly sponsorships: Pick<SponsorshipRepository, "end">) {}

  async execute(sponsor: Sponsor, sponsorshipId: string): Promise<Result<Sponsorship, DomainError>> {
    const ended = await this.sponsorships.end(sponsor.userId, sponsor.partnerId, sponsorshipId);
    return ended ? ok(ended) : err(new NotFoundError("Destaque"));
  }
}

export type SponsorshipItem = Sponsorship & { targetName: string; running: boolean };

/** Destaques do parceiro, com o nome do lugar/evento e se ainda estão valendo. */
export class ListMySponsorships {
  constructor(
    private readonly sponsorships: Pick<SponsorshipRepository, "listByPartner">,
    private readonly targets: Pick<OfferTargets, "names">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(sponsor: Sponsor): Promise<SponsorshipItem[]> {
    const mine = await this.sponsorships.listByPartner(sponsor.userId, sponsor.partnerId);
    const names = await this.targets.names(mine.map((s) => s.target));
    const now = this.now();
    return mine.map((s) => ({ ...s, targetName: names.get(targetKey(s.target)) ?? "Removido", running: stillRunning(s, now) }));
  }
}

/** A conta perdeu o direito ao destaque (ex.: assinatura suspensa): os destaques ativos dela são encerrados. */
export class EndSponsorshipsWithoutPlan {
  constructor(
    private readonly sponsorships: Pick<SponsorshipRepository, "endAllOf">,
    private readonly entitled: VisibilityEntitlement,
  ) {}

  async execute(ownerId: string): Promise<number> {
    if (await this.entitled(ownerId)) return 0;
    return this.sponsorships.endAllOf(ownerId);
  }
}
