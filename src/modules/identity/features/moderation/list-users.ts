import { ForbiddenError, err, ok, type Result } from "@/shared/kernel";
import type { UserDirectory, UserSummary } from "../../domain/roles";
import type { CurrentUser } from "../../domain/session";
import { hasRole } from "../authorization/authorization";

/**
 * Lista de usuários para moderação (admin). A autorização é conferida aqui também,
 * não só na página: o caso de uso nunca confia que quem chama já checou.
 */
export class ListUsersForModeration {
  constructor(private readonly directory: UserDirectory) {}

  async execute(actor: CurrentUser, limit = 50): Promise<Result<UserSummary[], ForbiddenError>> {
    if (!hasRole(actor, "admin")) return err(new ForbiddenError());
    return ok(await this.directory.listRecent(Math.min(Math.max(limit, 1), 200)));
  }
}
