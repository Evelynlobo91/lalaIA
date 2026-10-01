import type { DomainEventPublisher } from "@/shared/events";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { Logger } from "@/shared/observability";
import type { AvatarStorage } from "../../domain/avatar";
import { defaultConsents, type ConsentRepository, type Consents } from "../../domain/consents";
import type { ProfileRepository } from "../../domain/profile";
import type { CurrentUser } from "../../domain/session";

// ---------------------------------------------------------------------------------------------------
// Consentimentos (revogáveis)
// ---------------------------------------------------------------------------------------------------

export class GetConsents {
  constructor(private readonly consents: Pick<ConsentRepository, "find">) {}

  async execute(userId: string): Promise<Consents & { updatedAt: Date | null }> {
    const saved = await this.consents.find(userId);
    return saved ?? { ...defaultConsents, updatedAt: null };
  }
}

export class UpdateConsents {
  constructor(private readonly consents: Pick<ConsentRepository, "save">) {}

  async execute(userId: string, input: Consents): Promise<Result<Consents, DomainError>> {
    await this.consents.save(userId, input);
    return ok(input);
  }
}

// ---------------------------------------------------------------------------------------------------
// Exportação (portabilidade, art. 18 V)
// ---------------------------------------------------------------------------------------------------

/**
 * Uma fonte de dados pessoais. Cada módulo fornece a sua pela API pública (montadas no bootstrap);
 * um módulo novo que guarde dados da pessoa = uma fonte nova (OCP).
 */
export interface PersonalDataSource {
  readonly name: string;
  export(user: CurrentUser): Promise<unknown>;
}

export type PersonalDataExport = {
  geradoEm: string;
  titular: { id: string; email: string };
  dados: Record<string, unknown>;
  observacoes: string[];
};

export class ExportPersonalData {
  constructor(
    private readonly sources: readonly PersonalDataSource[],
    private readonly log: Pick<Logger, "warn">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(user: CurrentUser): Promise<PersonalDataExport> {
    const parts = await Promise.all(
      this.sources.map(async (source) => {
        try {
          return [source.name, await source.export(user)] as const;
        } catch (error) {
          // Uma fonte fora do ar não impede a exportação do resto; a pessoa vê que faltou.
          this.log.warn("fonte de dados pessoais indisponível na exportação", { source: source.name, error: error instanceof Error ? error.message : String(error) });
          return [source.name, { indisponivel: "Não foi possível exportar esta parte agora. Tente de novo em alguns minutos." }] as const;
        }
      }),
    );
    return {
      geradoEm: this.clock().toISOString(),
      titular: { id: user.id, email: user.email },
      dados: Object.fromEntries(parts),
      observacoes: [
        "As métricas de uso (visualizações, cliques) são anônimas: não guardamos quem fez cada ação, então elas não aparecem aqui.",
        "A sua localização nunca é gravada.",
      ],
    };
  }
}

// ---------------------------------------------------------------------------------------------------
// Exclusão de conta (art. 18 VI)
// ---------------------------------------------------------------------------------------------------

export interface AccountDeleter {
  /** Apaga a conta; os dados ligados a ela saem em cascata (ou ficam sem dono, ex.: lugares do OSM). */
  delete(userId: string): Promise<void>;
}

export interface SessionEnder {
  signOut(): Promise<void>;
}

/**
 * Exclui a conta: 1) avisa os módulos (`identity.UserDeleted`) para limparem o que não sai sozinho;
 * 2) apaga a foto; 3) apaga a conta (cascata); 4) encerra a sessão. Falha de um módulo no passo 1 é
 * isolada pelo bus (logada) e não impede a exclusão: o direito da pessoa vem primeiro.
 */
export class DeleteAccount {
  constructor(
    private readonly events: DomainEventPublisher,
    private readonly profiles: Pick<ProfileRepository, "find">,
    private readonly avatars: Pick<AvatarStorage, "remove">,
    private readonly accounts: AccountDeleter,
    private readonly session: SessionEnder,
    private readonly log: Pick<Logger, "warn" | "info">,
  ) {}

  async execute(userId: string): Promise<Result<{ deleted: true }, DomainError>> {
    await this.events.publish("identity.UserDeleted", { userId });

    const avatar = (await this.profiles.find(userId))?.avatarPath;
    if (avatar) await this.avatars.remove(avatar).catch((error: unknown) => this.log.warn("não foi possível apagar a foto na exclusão", { err: error }));

    await this.accounts.delete(userId);
    await this.session.signOut().catch((error: unknown) => this.log.warn("falha ao encerrar a sessão após excluir a conta", { err: error }));
    this.log.info("conta excluída a pedido do titular", { userId });
    return ok({ deleted: true });
  }
}
