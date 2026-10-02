// Check-in por GPS com geofence (#61, RF30). Regras puras: precisão, raio, permanência e limite de tentativas.
// A coordenada nunca é gravada: só o resultado e a distância arredondada.
import { usesGeofence, type StepGeofence, type ValidationKind } from "./mission";

/** Posição informada pelo navegador, já arredondada (~10 m) e dentro da área atendida. */
export type GeoFix = { lat: number; lon: number; accuracyMeters: number };

export const GEOFENCE_RADIUS_METERS = { min: 30, max: 300, default: 100 } as const;
export const DWELL_MINUTES = { min: 0, max: 30, default: 2 } as const;

/** Precisão pior que isso (posição por rede/Wi-Fi, ambiente fechado) não comprova presença no lugar. */
export const MAX_ACCURACY_METERS = 100;

/** Anti-fraude: no máximo 10 tentativas por etapa e por pessoa a cada 60 min. */
export const GEOFENCE_ATTEMPTS = { max: 10, windowMinutes: 60 } as const;

/** O check-in de chegada vale para a permanência por até (permanência + 30 min). */
export const DWELL_GRACE_MINUTES = 30;

export type GeofenceOutcome = "inside" | "outside" | "inaccurate";

export type GeofenceAttempt = { outcome: GeofenceOutcome; distanceMeters: number | null; attemptedAt: Date };

export const defaultGeofence = (): StepGeofence => ({ radiusMeters: GEOFENCE_RADIUS_METERS.default, dwellMinutes: DWELL_MINUTES.default });

/**
 * Geofence efetiva de uma etapa: null nas etapas só de QR; padrão quando faltar; e sem permanência em
 * "QR + GPS" (o QR do balcão, que gira a cada minuto, já comprova a presença).
 */
export function geofenceFor(kind: ValidationKind, geofence: StepGeofence | null | undefined): StepGeofence | null {
  if (!usesGeofence(kind)) return null;
  const g = geofence ?? defaultGeofence();
  return kind === "qr_gps" ? { ...g, dwellMinutes: 0 } : g;
}

/** Distância gravada e mostrada: arredondada para 10 m (não reconstrói a posição). */
export const roundDistance = (meters: number) => Math.round(meters / 10) * 10;

/** Desde quando ler as tentativas (para o limite de tentativas e para a permanência). */
export function attemptsSince(now: Date, geofence: StepGeofence): Date {
  const minutes = Math.max(GEOFENCE_ATTEMPTS.windowMinutes, geofence.dwellMinutes + DWELL_GRACE_MINUTES);
  return new Date(now.getTime() - minutes * 60_000);
}

export const attemptsExceeded = (attempts: GeofenceAttempt[], now: Date) =>
  attempts.filter((a) => a.attemptedAt.getTime() > now.getTime() - GEOFENCE_ATTEMPTS.windowMinutes * 60_000).length >= GEOFENCE_ATTEMPTS.max;

export type DwellStatus = { satisfied: true } | { satisfied: false; minutesLeft: number };

/**
 * Permanência mínima no raio: conta desde o início da sequência atual de check-ins "dentro" (um "fora"
 * zera a sequência; leituras imprecisas não contam). Só considera tentativas da janela
 * (permanência + tolerância): chegar ontem não vale hoje. `attempts` já inclui o check-in atual.
 */
export function dwellStatus(attempts: GeofenceAttempt[], now: Date, dwellMinutes: number): DwellStatus {
  if (dwellMinutes <= 0) return { satisfied: true };
  const from = now.getTime() - (dwellMinutes + DWELL_GRACE_MINUTES) * 60_000;
  let streakStart: Date | null = null;
  for (const a of [...attempts].sort((x, y) => x.attemptedAt.getTime() - y.attemptedAt.getTime())) {
    if (a.attemptedAt.getTime() < from) continue;
    if (a.outcome === "outside") streakStart = null;
    else if (a.outcome === "inside" && !streakStart) streakStart = a.attemptedAt;
  }
  if (!streakStart) return { satisfied: false, minutesLeft: dwellMinutes };
  // O horário da tentativa vem do relógio do banco e `now` do app: com o banco alguns segundos adiantado, o
  // decorrido ficaria negativo e pediria mais que a permanência exigida. Nunca menos que zero.
  const elapsed = Math.max(0, now.getTime() - streakStart.getTime());
  const needed = dwellMinutes * 60_000;
  return elapsed >= needed ? { satisfied: true } : { satisfied: false, minutesLeft: Math.max(1, Math.ceil((needed - elapsed) / 60_000)) };
}

/** Registro das tentativas de check-in (append-only, gravado como o próprio usuário). */
export interface GeofenceAttemptLog {
  recent(userId: string, stepId: string, since: Date): Promise<GeofenceAttempt[]>;
  record(userId: string, stepId: string, attempt: { outcome: GeofenceOutcome; distanceMeters: number | null }): Promise<GeofenceAttempt>;
}

/** Consentimento de localização da pessoa (módulo identity, LGPD #25). */
export interface GeolocationConsent {
  allowsGeolocation(userId: string): Promise<boolean>;
}

/** Distância (m) de um ponto até o lugar da etapa, calculada pelo PostGIS no módulo places; null se o lugar não existe. */
export interface PlaceDistance {
  distanceTo(origin: { lat: number; lon: number }, placeId: string): Promise<number | null>;
}
