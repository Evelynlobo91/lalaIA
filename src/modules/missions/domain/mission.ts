// Missão urbana (RF26): etapas ordenadas, cada uma num lugar e com um tipo de validação.

export type MissionStatus = "active" | "archived";

/**
 * Tipos de validação de etapa. Cada tipo tem uma estratégia (`StepValidator`); um tipo novo
 * entra aqui, no `check` do banco e como nova estratégia, sem mudar os casos de uso.
 * - `qr`: QR code assinado no balcão;
 * - `gps`: check-in por GPS dentro da geofence do lugar (#61);
 * - `qr_gps`: os dois (QR do balcão + localização no raio).
 */
export const validationKinds = ["qr", "gps", "qr_gps"] as const;
export type ValidationKind = (typeof validationKinds)[number];

/** Geofence da etapa: raio em volta do lugar e permanência mínima no raio (só nas etapas com GPS). */
export type StepGeofence = { radiusMeters: number; dwellMinutes: number };

/** A etapa pede localização? */
export const usesGeofence = (kind: ValidationKind) => kind === "gps" || kind === "qr_gps";
/** A etapa pede o QR do balcão? */
export const usesQr = (kind: ValidationKind) => kind === "qr" || kind === "qr_gps";

export const MAX_STEPS = 10;
export const MIN_XP = 10;
export const MAX_XP = 1000;

export type StepDraft = {
  title: string;
  placeId: string;
  validation: ValidationKind;
  /** Obrigatória nas etapas com GPS (`gps`, `qr_gps`); ausente/null nas de QR. */
  geofence?: StepGeofence | null;
};

export type MissionDraft = {
  title: string;
  description: string;
  /** XP total: somado, o que se ganha nas etapas e no bônus de conclusão. */
  xp: number;
  startsAt: Date;
  endsAt: Date;
  steps: StepDraft[];
  /**
   * Missão surpresa (#63): fora da lista pública; oferecida a quem está perto, com validade curta.
   * As etapas só se revelam depois do aceite, uma por vez. Ausente = false.
   */
  surprise?: boolean;
  /** Tempo estimado para concluir, em minutos (#64); ausente/null = estimado pelas etapas. */
  estimatedMinutes?: number | null;
  /** Gasto estimado por pessoa, em centavos (#64); 0 = grátis; ausente/null = não informado. */
  costCents?: number | null;
};

/** Estimativa quando o parceiro não informa: cerca de 30 min por etapa (deslocamento + atividade). */
export const MINUTES_PER_STEP = 30;
export const ESTIMATED_MINUTES = { min: 10, max: 600 } as const;
export const MAX_COST_CENTS = 100_000;

/** Tempo para concluir a missão: o informado pelo parceiro ou 30 min por etapa. */
export function estimatedMinutesOf(mission: Pick<MissionDraft, "estimatedMinutes" | "steps">): number {
  return mission.estimatedMinutes ?? Math.max(1, mission.steps.length) * MINUTES_PER_STEP;
}

export type MissionStep = StepDraft & { id: string; missionId: string; position: number };

export type MissionRecord = Omit<MissionDraft, "steps"> & {
  id: string;
  ownerId: string;
  status: MissionStatus;
  createdAt: Date;
  steps: MissionStep[];
};

/** Disponível para aceitar e jogar: ativa e dentro da janela de validade. */
export function isAvailable(mission: Pick<MissionRecord, "status" | "startsAt" | "endsAt">, now: Date): boolean {
  return mission.status === "active" && mission.startsAt <= now && now < mission.endsAt;
}

/**
 * Divide o XP total entre as etapas e o bônus de conclusão. Cada etapa vale `floor(total / (n + 1))`
 * e o bônus fica com o resto, então a soma é sempre exatamente o total e o bônus nunca é menor que uma etapa.
 * Ex.: 100 XP em 3 etapas → 25 por etapa + 25 de bônus; 100 XP em 2 etapas → 33 + 33 + 34.
 */
/**
 * GPS é falsificável no celular: uma recompensa real (#62) só pode ser vinculada a missões em que
 * TODA etapa exige o QR do balcão (`qr` ou `qr_gps`). Etapas só por GPS valem XP, nunca prêmio.
 */
export function allowsRealReward(mission: Pick<MissionRecord, "steps">): boolean {
  return mission.steps.length > 0 && mission.steps.every((s) => usesQr(s.validation));
}

export function xpSplit(total: number, stepCount: number): { perStep: number; completionBonus: number } {
  const perStep = Math.floor(total / (stepCount + 1));
  return { perStep, completionBonus: total - perStep * stepCount };
}

export interface MissionRepository {
  findById(id: string): Promise<MissionRecord | null>;
  listByOwner(ownerId: string): Promise<MissionRecord[]>;
  /** Ativas, dentro da janela em `now` e NÃO surpresa, das que terminam antes para as que terminam depois. */
  listAvailable(now: Date, limit: number): Promise<MissionRecord[]>;
  /** Missões surpresa ativas e dentro da janela em `now` (#63). */
  listAvailableSurprises(now: Date, limit: number): Promise<MissionRecord[]>;
  findByIds(ids: string[]): Promise<MissionRecord[]>;
  /** Missão (com todas as etapas) à qual a etapa pertence. */
  findByStepId(stepId: string): Promise<MissionRecord | null>;
  /** Escritas rodam como o usuário (asUser): RLS garante dono/papel no banco. */
  create(actorId: string, draft: MissionDraft): Promise<MissionRecord>;
  /** `saveSteps: false` mantém as etapas como estão (missão que já tem participantes). */
  update(actorId: string, id: string, draft: MissionDraft, options: { saveSteps: boolean }): Promise<MissionRecord | null>;
  archive(actorId: string, id: string): Promise<MissionRecord | null>;
}

export type MissionPlace = { id: string; name: string; neighborhood: string | null };

/** Porta para os lugares das etapas (implementada pela API pública do módulo places). */
export interface MissionPlaces {
  summaries(ids: string[]): Promise<MissionPlace[]>;
  /** Lugares que o usuário administra (parceiro dono). */
  managedBy(userId: string): Promise<MissionPlace[]>;
}
