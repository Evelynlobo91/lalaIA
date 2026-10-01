// Missão aceita por um usuário (RF28): uma instância por usuário e missão.

export type UserMissionStatus = "active" | "completed";

export type UserMission = {
  id: string;
  userId: string;
  missionId: string;
  status: UserMissionStatus;
  acceptedAt: Date;
  completedAt: Date | null;
};

/** Limite de missões em andamento ao mesmo tempo: incentiva concluir antes de colecionar. */
export const MAX_ACTIVE_MISSIONS = 5;

export interface UserMissionRepository {
  /** Leituras do próprio usuário rodam com asUser (RLS: cada um só vê as suas). */
  find(userId: string, missionId: string): Promise<UserMission | null>;
  listByUser(userId: string): Promise<UserMission[]>;
  countActive(userId: string): Promise<number>;
  /** Idempotente: se já aceitou, devolve o aceite existente. */
  accept(userId: string, missionId: string): Promise<UserMission>;
}

/** Porta usada ao editar missões: depois do primeiro aceite, etapas e XP ficam travados. */
export interface MissionParticipation {
  hasParticipants(missionId: string): Promise<boolean>;
}
