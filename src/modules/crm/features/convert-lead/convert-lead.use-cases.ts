import { z } from "zod";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { INVITE_DAYS, inviteKinds, inviteStatus, type InviteData, type InviteKind, type InviteStatus, type InviteStore, type InviteTokens, type PartnerActivator } from "../../domain/conversion";
import type { CrmActor, LeadRepository } from "../../domain/lead";
import { openStages } from "../../domain/pipeline";

const kinds = inviteKinds.map((k) => k.id) as [InviteKind, ...InviteKind[]];

export const startConversionSchema = z
  .object({
    leadId: z.uuid(),
    kind: z.enum(kinds, { error: "Escolha o tipo de parceiro." }),
    // Aceita "(47) 3433-0000", "+55 47 99999-0000"...; grava só os dígitos.
    phone: z
      .string()
      .transform((v) => v.replace(/[^\d+]/g, ""))
      .pipe(z.string().regex(/^\+?\d{10,13}$/, "Informe um telefone com DDD.")),
    description: z.string().trim().min(20, "Descreva o negócio (pelo menos 20 caracteres).").max(600, "Use no máximo 600 caracteres."),
    // Lugar a vincular: opcional (vazio = sem vínculo agora).
    placeId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
  })
  .transform(({ leadId, ...data }): { leadId: string; data: InviteData } => ({ leadId, data }));

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const DAY_MS = 86_400_000;

/**
 * Converte o lead fechado em parceiro (#150), em duas partes: aqui o comercial gera o convite com os dados
 * do parceiro; a pessoa de contato aceita pelo link (`AcceptInvite`) e o parceiro nasce aprovado.
 */
export class StartConversion {
  constructor(
    private readonly leads: Pick<LeadRepository, "findById">,
    private readonly invites: Pick<InviteStore, "create">,
    private readonly tokens: InviteTokens,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: CrmActor, leadId: string, data: InviteData): Promise<Result<{ token: string; expiresAt: Date }, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    const lead = await this.leads.findById(actor.id, leadId);
    if (!lead) return err(new NotFoundError("Lead"));
    if (lead.stage === "ativo") return err(new BusinessRuleError("lead_already_converted", "Este lead já virou parceiro ativo."));
    if (!(openStages as readonly string[]).includes(lead.stage)) return err(new BusinessRuleError("lead_lost", "Reabra o lead no funil antes de converter."));

    const { token, hash } = this.tokens.generate();
    const expiresAt = new Date(this.now().getTime() + INVITE_DAYS * DAY_MS);
    const created = await this.invites.create(actor.id, leadId, hash, data, expiresAt);
    return created ? ok({ token, expiresAt }) : err(new NotFoundError("Lead"));
  }
}

export type InviteView = { status: InviteStatus; businessName: string };

/** O que a pessoa vê ao abrir o link. Token desconhecido e token malformado respondem igual (não encontrado). */
export class GetInvite {
  constructor(
    private readonly invites: Pick<InviteStore, "findByTokenHash">,
    private readonly tokens: Pick<InviteTokens, "hash">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(token: string): Promise<Result<InviteView, DomainError>> {
    if (!tokenSchema.safeParse(token).success) return err(new NotFoundError("Convite"));
    const invite = await this.invites.findByTokenHash(this.tokens.hash(token));
    if (!invite) return err(new NotFoundError("Convite"));
    return ok({ status: inviteStatus(invite, this.now()), businessName: invite.businessName });
  }
}

const inviteMessages: Record<Exclude<InviteStatus, "valid">, string> = {
  expired: "Este convite venceu. Peça um novo link ao time do LalaIA.",
  revoked: "Este convite foi substituído por outro. Use o link mais recente.",
  accepted: "Este convite já foi usado por outra conta.",
};

/**
 * A pessoa de contato aceita o convite: vira parceira aprovada com os dados do lead (sem recadastro) e o
 * lead vai para "ativo". Idempotente: aceitar de novo com a mesma conta não cria um segundo parceiro.
 */
export class AcceptInvite {
  constructor(
    private readonly invites: Pick<InviteStore, "findByTokenHash" | "markAccepted">,
    private readonly tokens: Pick<InviteTokens, "hash">,
    private readonly partners: PartnerActivator,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, token: string): Promise<Result<{ partnerId: string | null }, DomainError>> {
    if (!tokenSchema.safeParse(token).success) return err(new NotFoundError("Convite"));
    const invite = await this.invites.findByTokenHash(this.tokens.hash(token));
    if (!invite) return err(new NotFoundError("Convite"));

    const status = inviteStatus(invite, this.now());
    // Mesma pessoa abrindo o link de novo: já está feito.
    if (status === "accepted" && invite.acceptedBy === userId) return ok({ partnerId: null });
    if (status !== "valid") return err(new BusinessRuleError(`invite_${status}`, inviteMessages[status]));
    // Quem gerou o convite fica como revisor do cadastro; sem essa pessoa, o convite não vale mais.
    if (!invite.createdBy) return err(new BusinessRuleError("invite_revoked", inviteMessages.revoked));

    const activated = await this.partners.activate({
      userId,
      activatedBy: invite.createdBy,
      kind: invite.kind,
      businessName: invite.businessName,
      phone: invite.phone,
      description: invite.description,
      placeId: invite.placeId,
    });
    if (!activated.ok) return activated;

    await this.invites.markAccepted(invite.id, userId, activated.value.partnerId);
    return ok({ partnerId: activated.value.partnerId });
  }
}
