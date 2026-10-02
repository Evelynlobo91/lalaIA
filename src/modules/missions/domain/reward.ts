// Recompensa do parceiro vinculada à missão (#62, RF36): quem conclui a missão resgata um código curto
// e o parceiro dono da missão valida no balcão.

export const MAX_REWARD_STOCK = 100_000;
export const REWARD_DESCRIPTION = { min: 3, max: 120 } as const;

export type RewardDraft = {
  /** O que a pessoa ganha (ex.: "1 chope grátis"). */
  description: string;
  /** Estoque total; null = sem limite. Cada pessoa resgata uma vez só. */
  stock: number | null;
};

export type MissionReward = RewardDraft & {
  missionId: string;
  /** Quantos códigos já foram emitidos (mantido pelo banco, sob lock). */
  claimedCount: number;
  createdAt: Date;
};

export type RewardClaim = {
  id: string;
  missionId: string;
  userId: string;
  code: string;
  claimedAt: Date;
  validatedAt: Date | null;
};

/** Esgotou? (o banco garante o estoque sob concorrência; isto é só para a tela e a checagem rápida). */
export const isSoldOut = (reward: Pick<MissionReward, "stock" | "claimedCount">) => reward.stock !== null && reward.claimedCount >= reward.stock;

/** Restantes; null = sem limite. */
export const remainingOf = (reward: Pick<MissionReward, "stock" | "claimedCount">) => (reward.stock === null ? null : Math.max(0, reward.stock - reward.claimedCount));

/** Depois do primeiro resgate a recompensa não muda (quem resgatou fica com o prêmio que viu). */
export const isRewardLocked = (reward: Pick<MissionReward, "claimedCount">) => reward.claimedCount > 0;

export interface MissionRewardRepository {
  find(missionId: string): Promise<MissionReward | null>;
  /** Cria ou atualiza como o parceiro (asUser): a RLS confere dono, papel e etapas só por QR. */
  save(actorId: string, missionId: string, draft: RewardDraft): Promise<MissionReward>;
  /** Quantos códigos da missão já foram validados no balcão (portal do dono). */
  countValidated(actorId: string, missionId: string): Promise<number>;
}

export type ClaimOutcome =
  | { kind: "claimed"; claim: RewardClaim; created: boolean }
  /** Estoque acabou (trigger com lock na linha da recompensa). */
  | { kind: "sold_out" }
  /** RLS recusou: a missão não está concluída ou deixou de dar prêmio real. */
  | { kind: "unavailable" }
  /** Colisão de código: o caso de uso sorteia outro. */
  | { kind: "code_taken" };

export type MyRewardClaim = RewardClaim & { missionTitle: string; description: string };

export interface RewardClaimRepository {
  /** Leituras e escritas rodam como o usuário (asUser): cada um só vê os próprios resgates. */
  findMine(userId: string, missionId: string): Promise<RewardClaim | null>;
  listMine(userId: string): Promise<MyRewardClaim[]>;
  /** Idempotente por pessoa e missão (unique + on conflict do nothing). */
  claim(userId: string, missionId: string, code: string): Promise<ClaimOutcome>;
  /** Código de uma missão do parceiro (RLS: só o dono vê os resgates da missão). */
  findForOwner(actorId: string, missionId: string, code: string): Promise<RewardClaim | null>;
  /** Marca como usado uma vez só (update condicional); null se já estava validado ou não é do parceiro. */
  markValidated(actorId: string, claimId: string): Promise<RewardClaim | null>;
}
