import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { can } from "../../domain/capabilities";
import "../../domain/events";
import type { Role } from "../../domain/roles";
import type { CurrentUser } from "../../domain/session";

/** Papéis que o admin concede pela tela. `admin` fica de fora de propósito: só pelo comando `npm run role`. */
export const teamRoles = ["commercial", "finance", "moderator"] as const;
export type TeamRole = (typeof teamRoles)[number];

/** Formulário de papéis de uma pessoa: os marcados ficam, os desmarcados saem. */
export const teamRolesSchema = z.object({
  userId: z.uuid(),
  roles: z.array(z.enum(teamRoles)).max(teamRoles.length).default([]),
});

export interface TeamRoleStore {
  /** Papéis atuais da pessoa; null se a conta não existe. */
  currentRoles(userId: string): Promise<Role[] | null>;
  grant(userId: string, role: TeamRole, grantedBy: string): Promise<void>;
  revoke(userId: string, role: TeamRole): Promise<void>;
}

/**
 * Admin define os papéis internos (comercial, financeiro, moderação) de uma pessoa (#157).
 * Só mexe nesses três: `admin` e `partner` não são tocados. Publica um evento por mudança (auditoria).
 */
export class SetTeamRoles {
  constructor(
    private readonly store: TeamRoleStore,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(actor: Pick<CurrentUser, "id" | "roles">, userId: string, wanted: readonly TeamRole[]): Promise<Result<{ userId: string; roles: TeamRole[] }, DomainError>> {
    if (!can(actor, "roles:manage")) return err(new ForbiddenError());
    const current = await this.store.currentRoles(userId);
    if (!current) return err(new NotFoundError("Usuário"));

    for (const role of teamRoles) {
      const has = current.includes(role);
      const wants = wanted.includes(role);
      if (wants && !has) {
        await this.store.grant(userId, role, actor.id);
        await this.events.publish("identity.RoleGranted", { userId, role, grantedBy: actor.id });
      } else if (!wants && has) {
        await this.store.revoke(userId, role);
        await this.events.publish("identity.RoleRevoked", { userId, role, revokedBy: actor.id });
      }
    }
    return ok({ userId, roles: teamRoles.filter((role) => wanted.includes(role)) });
  }
}
