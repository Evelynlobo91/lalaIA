import type { DomainEventPublisher } from "@/shared/events";
import { ok, type BusinessRuleError, type Result } from "@/shared/kernel";
import type { SignUpGateway } from "../../domain/auth-gateway";
import "../../domain/events";
import { CURRENT_TERMS_VERSION } from "../../domain/terms";
import type { RegisterInput } from "./register.schema";

export type RegisterResult = { needsEmailConfirmation: boolean };

/** RF01 — Cadastro de usuário com aceite dos termos vigentes. */
export class RegisterUser {
  constructor(
    private readonly auth: SignUpGateway,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(input: RegisterInput, emailRedirectTo: string): Promise<Result<RegisterResult, BusinessRuleError>> {
    const result = await this.auth.signUp({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      termsVersion: CURRENT_TERMS_VERSION,
      emailRedirectTo,
    });
    if (!result.ok) return result;

    const outcome = result.value;
    if (outcome.kind === "undisclosed") {
      // Mesma resposta de um cadastro novo: não revela que o e-mail existe (anti-enumeração).
      return ok({ needsEmailConfirmation: true });
    }

    await this.events.publish("identity.UserRegistered", { userId: outcome.userId });
    return ok({ needsEmailConfirmation: outcome.needsEmailConfirmation });
  }
}
