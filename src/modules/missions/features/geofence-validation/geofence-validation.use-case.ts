import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { CompleteStep, StepCompleted } from "../qr-validation/complete-step.use-case";
import type { GeofenceCheckInInput } from "./geofence-validation.schema";

/**
 * Resultado do check-in: etapa concluída, ou "chegou, mas falta a permanência mínima" (não é erro:
 * a tela pede para ficar por perto e tocar de novo).
 */
export type GeofenceCheckInResult = ({ status: "completed" } & StepCompleted) | { status: "dwell"; missionId: string; stepId: string; minutesLeft: number };

/**
 * RF30 (#61) — "Fazer check-in" numa etapa por GPS. Monta a prova e delega a `CompleteStep`, que escolhe
 * a estratégia (`GeofenceValidator`) e aplica as regras de sempre (aceite, prazo, ordem e uso único).
 */
export class GeofenceCheckIn {
  constructor(private readonly completeStep: Pick<CompleteStep, "execute">) {}

  async execute(userId: string, input: GeofenceCheckInInput): Promise<Result<GeofenceCheckInResult, DomainError>> {
    const result = await this.completeStep.execute(userId, {
      stepId: input.stepId,
      proof: { kind: "gps", fix: { lat: input.lat, lon: input.lon, accuracyMeters: input.accuracy } },
    });
    if (result.ok) return ok({ status: "completed", ...result.value });
    if (result.error.code === "dwell_pending") {
      const details = result.error.details as { missionId: string; minutesLeft: number };
      return ok({ status: "dwell", missionId: details.missionId, stepId: input.stepId, minutesLeft: details.minutesLeft });
    }
    return result;
  }
}
