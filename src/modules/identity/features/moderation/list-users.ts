import { ForbiddenError, err, ok, type Result } from "@/shared/kernel";
import type { UserDirectory, UserSummary } from "../../domain/roles";
import type { CurrentUser } from "../../domain/session";
import { can } from "../../domain/capabilities";

/**
 * Lista de usuários para moderação (quem tem `users:read`: admin e moderação). A autorização é conferida aqui também,
 * não só na página: o caso de uso nunca confia que quem chama já checou.
 */
export class ListUsersForModeration {
  constructor(private readonly directory: UserDirectory) {}

  async execute(actor: CurrentUser, limit = 50, text = ""): Promise<Result<UserSummary[], ForbiddenError>> {
    if (!can(actor, "users:read")) return err(new ForbiddenError());
    const max = Math.min(Math.max(limit, 1), 200);
    const query = text.trim().slice(0, 80);
    return ok(await (query ? this.directory.listRecent(max, query) : this.directory.listRecent(max)));
  }
}
