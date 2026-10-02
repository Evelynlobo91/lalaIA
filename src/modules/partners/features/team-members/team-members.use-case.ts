import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";

/** Membros por parceiro (o dono não conta). */
export const MAX_TEAM_MEMBERS = 10;

/** `joined`: já existe uma conta confirmada com este e-mail (o acesso está valendo). */
export type TeamMember = { id: string; email: string; invitedAt: Date; joined: boolean };

/** Equipe a que a pessoa pertence (como membro, não como dona). */
export type Membership = { partnerId: string; businessName: string };

/** O dono: a conta (id e e-mail da sessão) e o cadastro de parceiro aprovado dela. */
export type TeamOwner = { userId: string; email: string; partnerId: string };

/** Persistência da equipe. `actorId` vem da sessão; as consultas do dono rodam "como ele" sob RLS. */
export interface TeamRepository {
  list(actorId: string, partnerId: string): Promise<TeamMember[]>;
  /** null se o e-mail já está na equipe. */
  add(actorId: string, partnerId: string, email: string): Promise<TeamMember | null>;
  /** false se o membro não existe ou não é da equipe deste parceiro. */
  remove(actorId: string, partnerId: string, memberId: string): Promise<boolean>;
  /** Sistema: equipes (de parceiros aprovados) em que a conta, com e-mail confirmado, é membro agora. */
  membershipsOf(userId: string): Promise<Membership[]>;
}

/** #158 — O dono convida um funcionário pelo e-mail. O acesso vale quando a pessoa entra com esse e-mail. */
export class InviteTeamMember {
  constructor(private readonly team: Pick<TeamRepository, "list" | "add">) {}

  async execute(owner: TeamOwner, email: string): Promise<Result<TeamMember, DomainError>> {
    if (email === owner.email.toLowerCase()) {
      return err(new ValidationError("E-mail inválido.", [{ path: ["email"], message: "Este é o seu e-mail: você já tem acesso total." }]));
    }
    const current = await this.team.list(owner.userId, owner.partnerId);
    if (current.some((m) => m.email === email)) return err(new ConflictError("Esta pessoa já faz parte da equipe."));
    if (current.length >= MAX_TEAM_MEMBERS) {
      return err(new BusinessRuleError("team_full", `A equipe pode ter até ${MAX_TEAM_MEMBERS} pessoas. Remova alguém para convidar outra.`));
    }
    const added = await this.team.add(owner.userId, owner.partnerId, email);
    return added ? ok(added) : err(new ConflictError("Esta pessoa já faz parte da equipe."));
  }
}

/** O dono remove um membro: o acesso acaba na hora (a checagem é feita a cada requisição). */
export class RemoveTeamMember {
  constructor(private readonly team: Pick<TeamRepository, "remove">) {}

  async execute(owner: TeamOwner, memberId: string): Promise<Result<{ memberId: string }, DomainError>> {
    const removed = await this.team.remove(owner.userId, owner.partnerId, memberId);
    return removed ? ok({ memberId }) : err(new NotFoundError("Membro não encontrado."));
  }
}

/** Parceiros em cujo balcão a pessoa atende: o próprio (se for dona aprovada) e as equipes de que faz parte. */
export type CounterStaffing = (userId: string) => Promise<string[]>;

type CodeValidation<T> = { execute(author: { userId: string; partnerId: string }, code: string): Promise<Result<T, DomainError>> };

/**
 * Valida o código no balcão em nome de quem atende, dono ou membro. O código pertence à oferta de um
 * parceiro só: tenta em cada balcão da pessoa e fica com a primeira resposta que não seja "código inválido".
 */
export class ValidateCodeAtCounter<T> {
  constructor(
    private readonly staffing: CounterStaffing,
    private readonly validation: CodeValidation<T>,
  ) {}

  async execute(userId: string, code: string): Promise<Result<T, DomainError>> {
    const partnerIds = await this.staffing(userId);
    if (partnerIds.length === 0) return err(new ForbiddenError("Você não atende no balcão de nenhum parceiro."));

    let last: Result<T, DomainError> | null = null;
    for (const partnerId of partnerIds) {
      last = await this.validation.execute({ userId, partnerId }, code);
      if (last.ok || last.error.code !== "invalid_code") return last;
    }
    return last!;
  }
}
