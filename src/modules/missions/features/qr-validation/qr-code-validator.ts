import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import type { MissionStep } from "../../domain/mission";
import type { StepProof, StepTokenSigner, StepValidator, ValidationContext } from "../../domain/step-validation";

/** Estratégia "qr": a prova é o token assinado do QR do balcão, válido, não expirado e DESTA etapa. */
export class QrCodeValidator implements StepValidator {
  readonly kind = "qr" as const;

  constructor(private readonly tokens: StepTokenSigner) {}

  validate(step: MissionStep, proof: StepProof, { now }: ValidationContext): Result<void, BusinessRuleError> {
    if (proof.kind !== "qr") return err(new BusinessRuleError("qr_invalid", "Esta etapa é validada por QR code."));
    const verified = this.tokens.verify(proof.token, now);
    if (!verified.ok) return verified;
    if (verified.value.stepId !== step.id) return err(new BusinessRuleError("qr_invalid", "Este QR code é de outra etapa."));
    return ok(undefined);
  }
}
