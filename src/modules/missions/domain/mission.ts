// Missão urbana (RF26): etapas ordenadas, cada uma num lugar e com um tipo de validação.

export type MissionStatus = "active" | "archived";

/**
 * Tipos de validação de etapa. Cada tipo tem uma estratégia (`StepValidator`); um tipo novo
 * (ex.: "gps") entra aqui, no `check` do banco e como nova estratégia, sem mudar os casos de uso.
 */
export const validationKinds = ["qr"] as const;
export type ValidationKind = (typeof validationKinds)[number];

export const MAX_STEPS = 10;
export const MIN_XP = 10;
export const MAX_XP = 1000;

export type StepDraft = { title: string; placeId: string; validation: ValidationKind };

export type MissionDraft = {
  title: string;
  description: string;
  /** XP total: somado, o que se ganha nas etapas e no bônus de conclusão. */
  xp: number;
  startsAt: Date;
  endsAt: Date;
  steps: StepDraft[];
};

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
export function xpSplit(total: number, stepCount: number): { perStep: number; completionBonus: number } {
  const perStep = Math.floor(total / (stepCount + 1));
  return { perStep, completionBonus: total - perStep * stepCount };
}

export interface MissionRepository {
  findById(id: string): Promise<MissionRecord | null>;
  listByOwner(ownerId: string): Promise<MissionRecord[]>;
  /** Escritas rodam como o usuário (asUser): RLS garante dono/papel no banco. */
  create(actorId: string, draft: MissionDraft): Promise<MissionRecord>;
  update(actorId: string, id: string, draft: MissionDraft): Promise<MissionRecord | null>;
  archive(actorId: string, id: string): Promise<MissionRecord | null>;
}

export type MissionPlace = { id: string; name: string; neighborhood: string | null };

/** Porta para os lugares das etapas (implementada pela API pública do módulo places). */
export interface MissionPlaces {
  summaries(ids: string[]): Promise<MissionPlace[]>;
  /** Lugares que o usuário administra (parceiro dono). */
  managedBy(userId: string): Promise<MissionPlace[]>;
}
