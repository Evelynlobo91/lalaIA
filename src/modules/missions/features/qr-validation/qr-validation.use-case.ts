import { BusinessRuleError, err, type DomainError, type Result } from "@/shared/kernel";
import type { StepTokenSigner } from "../../domain/step-validation";
import type { CompleteStep, CompleteStepInput, StepCheck, StepCompleted } from "./complete-step.use-case";

/**
 * Entrada pelo QR (/missoes/validar?t=): o token diz qual é a etapa, e `CompleteStep` confere tudo
 * (inclusive a assinatura) pela estratégia de validação da etapa.
 */
export class QrStepValidation {
  constructor(
    private readonly tokens: Pick<StepTokenSigner, "claimedStepId">,
    private readonly completeStep: Pick<CompleteStep, "check" | "execute">,
  ) {}

  check(userId: string, token: string): Promise<Result<StepCheck, DomainError>> {
    const input = this.input(token);
    return input ? this.completeStep.check(userId, input) : Promise.resolve(invalid());
  }

  execute(userId: string, token: string): Promise<Result<StepCompleted, DomainError>> {
    const input = this.input(token);
    return input ? this.completeStep.execute(userId, input) : Promise.resolve(invalid());
  }

  private input(token: string): CompleteStepInput | null {
    const stepId = this.tokens.claimedStepId(token);
    return stepId ? { stepId, proof: { kind: "qr", token } } : null;
  }
}

const invalid = () => err(new BusinessRuleError("qr_invalid", "Este QR code não é válido. Peça ao estabelecimento para mostrar o QR atual."));
