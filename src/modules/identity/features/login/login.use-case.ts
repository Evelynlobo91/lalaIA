import { ok, type BusinessRuleError, type Result } from "@/shared/kernel";
import { safeRedirectPath } from "@/shared/http/safe-redirect";
import type { SessionGateway } from "../../domain/session";
import type { LoginInput } from "./login.schema";

export type LoginResult = { redirectTo: string };

/** RF02 — Login com e-mail e senha. Devolve para onde levar o usuário (só caminhos internos). */
export class LoginUser {
  constructor(private readonly sessions: SessionGateway) {}

  async execute(input: LoginInput): Promise<Result<LoginResult, BusinessRuleError>> {
    const result = await this.sessions.signIn(input.email, input.password);
    if (!result.ok) return result;
    return ok({ redirectTo: safeRedirectPath(input.next) });
  }
}
