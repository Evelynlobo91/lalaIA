import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import {
  MAX_ACCURACY_METERS,
  attemptsExceeded,
  attemptsSince,
  defaultGeofence,
  dwellStatus,
  roundDistance,
  type GeoFix,
  type GeofenceAttemptLog,
  type GeolocationConsent,
  type PlaceDistance,
} from "../../domain/geofence";
import type { MissionStep } from "../../domain/mission";
import type { StepProof, StepValidator, ValidationContext } from "../../domain/step-validation";

/**
 * Confere a presença no lugar da etapa: precisão, raio (PostGIS no módulo places), limite de tentativas e
 * permanência mínima. Grava só o resultado e a distância arredondada de cada tentativa; nunca a coordenada.
 */
export class GeofenceCheck {
  constructor(
    private readonly attempts: GeofenceAttemptLog,
    private readonly places: PlaceDistance,
    private readonly consent: GeolocationConsent,
  ) {}

  async validate(step: MissionStep, fix: GeoFix, { userId, now }: ValidationContext): Promise<Result<void, BusinessRuleError>> {
    // LGPD (#25): o navegador já respeita o cookie `lalaia-geo`; o servidor confere de novo o consentimento salvo.
    if (!(await this.consent.allowsGeolocation(userId))) {
      return err(new BusinessRuleError("geolocation_disabled", "Você desligou o uso da localização em Privacidade. Reative para fazer check-in.", { missionId: step.missionId }));
    }
    const geofence = step.geofence ?? defaultGeofence();
    const recent = await this.attempts.recent(userId, step.id, attemptsSince(now, geofence));
    // Anti-fraude: limite de tentativas por etapa e pessoa (não grava a tentativa recusada).
    if (attemptsExceeded(recent, now)) {
      return err(new BusinessRuleError("too_many_checkins", "Muitas tentativas de check-in nesta etapa. Tente de novo mais tarde.", { missionId: step.missionId }));
    }

    if (fix.accuracyMeters > MAX_ACCURACY_METERS) {
      await this.attempts.record(userId, step.id, { outcome: "inaccurate", distanceMeters: null });
      return err(
        new BusinessRuleError("gps_inaccurate", "Sua localização está imprecisa demais. Vá para um lugar aberto, ligue o GPS de alta precisão e tente de novo.", {
          missionId: step.missionId,
        }),
      );
    }

    const distance = await this.places.distanceTo(fix, step.placeId);
    if (distance === null) return err(new BusinessRuleError("place_unavailable", "O lugar desta etapa não está mais disponível.", { missionId: step.missionId }));

    const distanceMeters = roundDistance(distance);
    const inside = distance <= geofence.radiusMeters;
    const current = await this.attempts.record(userId, step.id, { outcome: inside ? "inside" : "outside", distanceMeters });
    if (!inside) {
      return err(
        new BusinessRuleError("outside_geofence", `Você está a cerca de ${formatMeters(distanceMeters)} do lugar. Chegue a menos de ${geofence.radiusMeters} m e faça o check-in de novo.`, {
          missionId: step.missionId,
          distanceMeters,
        }),
      );
    }

    const dwell = dwellStatus([...recent, current], now, geofence.dwellMinutes);
    if (!dwell.satisfied) {
      return err(
        new BusinessRuleError(
          "dwell_pending",
          `Você chegou! Fique por perto e faça o check-in de novo em ${dwell.minutesLeft} ${dwell.minutesLeft === 1 ? "minuto" : "minutos"} para concluir a etapa.`,
          { missionId: step.missionId, minutesLeft: dwell.minutesLeft },
        ),
      );
    }
    return ok(undefined);
  }
}

/** Estratégia "gps": a prova é a posição do celular no raio do lugar da etapa. */
export class GeofenceValidator implements StepValidator {
  readonly kind = "gps" as const;

  constructor(private readonly check: GeofenceCheck) {}

  validate(step: MissionStep, proof: StepProof, context: ValidationContext): Promise<Result<void, BusinessRuleError>> | Result<void, BusinessRuleError> {
    if (proof.kind !== "gps") return err(new BusinessRuleError("gps_required", "Esta etapa é validada por check-in no lugar. Toque em “Fazer check-in” na missão."));
    return this.check.validate(step, proof.fix, context);
  }
}

/**
 * Estratégia "qr_gps": QR do balcão E localização no raio (o QR fotografado e repassado não basta).
 * Na prévia (`dryRun`, GET do link do QR) confere só o QR; a localização vem no toque de concluir.
 */
export class QrAndGeofenceValidator implements StepValidator {
  readonly kind = "qr_gps" as const;

  constructor(
    private readonly qr: StepValidator,
    private readonly check: GeofenceCheck,
  ) {}

  async validate(step: MissionStep, proof: StepProof, context: ValidationContext): Promise<Result<void, BusinessRuleError>> {
    if (proof.kind === "gps") return err(new BusinessRuleError("qr_required", "Esta etapa também pede o QR code do balcão."));
    const qr = await this.qr.validate(step, { kind: "qr", token: proof.token }, context);
    if (!qr.ok) return qr;
    if (proof.kind === "qr") {
      return context.dryRun ? ok(undefined) : err(new BusinessRuleError("gps_required", "Esta etapa também pede a sua localização. Permita o acesso ao GPS e tente de novo."));
    }
    return context.dryRun ? ok(undefined) : this.check.validate(step, proof.fix, context);
  }
}

function formatMeters(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
