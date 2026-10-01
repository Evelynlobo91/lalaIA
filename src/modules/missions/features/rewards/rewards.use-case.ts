import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { generateShortCode, normalizeShortCode } from "@/shared/kernel/short-code";
import { formatDateTime } from "@/shared/time/joinville-time";
import "../../domain/events";
import { allowsRealReward, type MissionRecord, type MissionRepository } from "../../domain/mission";
import {
  isRewardLocked,
  isSoldOut,
  remainingOf,
  type MissionReward,
  type MissionRewardRepository,
  type RewardClaim,
  type RewardClaimRepository,
  type RewardDraft,
} from "../../domain/reward";
import type { UserMissionRepository } from "../../domain/user-mission";

/** Parceiro dono da missão: o id vem da sessão; o papel é conferido aqui também (não só na action). */
export type RewardOwner = { id: string; isPartner: boolean };

export const REWARD_MESSAGES = {
  requiresQr:
    "Recompensa só em missões com todas as etapas validadas por QR code no balcão (QR code ou QR code + GPS). Check-in só por GPS pode ser falsificado no celular: vale XP, mas não prêmio.",
  locked: "Esta recompensa já foi resgatada: não pode mais mudar.",
  soldOut: "As recompensas desta missão esgotaram. Sua missão continua concluída, com o XP.",
  notCompleted: "Conclua a missão para resgatar a recompensa.",
  unavailable: "Esta missão não está dando recompensa agora.",
  invalidCode: "Código inválido.",
} as const;

const MAX_CODE_ATTEMPTS = 3;

/** Missão do parceiro logado (dono, com papel de parceiro); erro para os demais. */
async function ownedMission(missions: Pick<MissionRepository, "findById">, owner: RewardOwner, missionId: string): Promise<Result<MissionRecord, DomainError>> {
  if (!owner.isPartner) return err(new ForbiddenError("Só parceiros oferecem recompensas."));
  const mission = await missions.findById(missionId);
  if (!mission) return err(new NotFoundError("Missão"));
  if (mission.ownerId !== owner.id) return err(new ForbiddenError("Só quem criou a missão vincula a recompensa."));
  return ok(mission);
}

/**
 * #62 — O parceiro dono vincula (ou edita) a recompensa da missão: descrição e estoque opcional.
 * Só em missão com todas as etapas por QR (`allowsRealReward`) e só até o primeiro resgate.
 */
export class SaveMissionReward {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly rewards: MissionRewardRepository,
  ) {}

  async execute(owner: RewardOwner, missionId: string, draft: RewardDraft): Promise<Result<MissionReward, DomainError>> {
    const owned = await ownedMission(this.missions, owner, missionId);
    if (!owned.ok) return owned;
    const mission = owned.value;
    if (mission.status === "archived") return err(new BusinessRuleError("mission_archived", "Missão encerrada não ganha recompensa nova."));
    if (!allowsRealReward(mission)) return err(new BusinessRuleError("reward_requires_qr", REWARD_MESSAGES.requiresQr));

    const current = await this.rewards.find(missionId);
    if (current && isRewardLocked(current)) return err(new BusinessRuleError("reward_locked", REWARD_MESSAGES.locked));

    return ok(await this.rewards.save(owner.id, missionId, draft));
  }
}

/**
 * #62 — Quem concluiu a missão resgata a recompensa: gera um código curto para mostrar no balcão.
 * Idempotente por pessoa e missão (resgatar de novo devolve o mesmo código e não publica evento). O estoque é
 * garantido pelo banco (trigger com lock na linha da recompensa), mesmo com resgates simultâneos. Esgotar não
 * mexe na missão: ela continua concluída, com o XP.
 */
export class ClaimMissionReward {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly userMissions: Pick<UserMissionRepository, "find">,
    private readonly rewards: Pick<MissionRewardRepository, "find">,
    private readonly claims: RewardClaimRepository,
    private readonly events: DomainEventPublisher,
    private readonly newCode: () => string = () => generateShortCode(),
  ) {}

  async execute(userId: string, missionId: string): Promise<Result<{ claim: RewardClaim; created: boolean }, DomainError>> {
    const reward = await this.rewards.find(missionId);
    if (!reward) return err(new NotFoundError("Recompensa"));

    const existing = await this.claims.findMine(userId, missionId);
    if (existing) return ok({ claim: existing, created: false });

    const mission = await this.missions.findById(missionId);
    if (!mission || !allowsRealReward(mission)) return err(new BusinessRuleError("reward_unavailable", REWARD_MESSAGES.unavailable));

    const userMission = await this.userMissions.find(userId, missionId);
    if (userMission?.status !== "completed") return err(new BusinessRuleError("mission_not_completed", REWARD_MESSAGES.notCompleted));
    if (isSoldOut(reward)) return err(new BusinessRuleError("reward_sold_out", REWARD_MESSAGES.soldOut));

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const outcome = await this.claims.claim(userId, missionId, this.newCode());
      if (outcome.kind === "code_taken") continue;
      if (outcome.kind === "sold_out") return err(new BusinessRuleError("reward_sold_out", REWARD_MESSAGES.soldOut));
      if (outcome.kind === "unavailable") return err(new BusinessRuleError("reward_unavailable", REWARD_MESSAGES.unavailable));

      const { claim, created } = outcome;
      // Publicado DEPOIS de gravar, e só no primeiro resgate.
      if (created) await this.events.publish("missions.RewardClaimed", { userId, missionId, claimId: claim.id });
      return ok({ claim, created });
    }
    throw new Error("Não foi possível gerar um código de recompensa único.");
  }
}

export type ValidatedReward = { missionId: string; code: string; description: string; claimedAt: Date; validatedAt: Date };

/**
 * #62 — O parceiro dono valida no balcão o código da recompensa, na página da missão. Vale uma vez só.
 * Código de outra missão (dele ou de outro parceiro) recebe a mesma resposta de um código inexistente
 * ("Código inválido."), para não revelar que ele existe.
 */
export class ValidateRewardCode {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly rewards: Pick<MissionRewardRepository, "find">,
    private readonly claims: RewardClaimRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(owner: RewardOwner, missionId: string, rawCode: string): Promise<Result<ValidatedReward, DomainError>> {
    const invalid = err(new BusinessRuleError("invalid_code", REWARD_MESSAGES.invalidCode));
    if (!owner.isPartner) return err(new ForbiddenError("Só parceiros validam recompensas."));
    const code = normalizeShortCode(rawCode);
    if (!code) return invalid;

    const mission = await this.missions.findById(missionId);
    if (!mission || mission.ownerId !== owner.id) return invalid;
    const reward = await this.rewards.find(missionId);
    if (!reward) return invalid;

    const found = await this.claims.findForOwner(owner.id, missionId, code);
    if (!found) return invalid;
    if (found.validatedAt) return err(new BusinessRuleError("code_used", `Este código já foi usado em ${formatDateTime(found.validatedAt)}.`));

    // Uma vez só, mesmo com duas validações ao mesmo tempo (update condicional + RLS).
    const validated = await this.claims.markValidated(owner.id, found.id);
    if (!validated?.validatedAt) return err(new BusinessRuleError("code_used", "Este código já foi usado."));

    await this.events.publish("missions.RewardValidated", { userId: found.userId, missionId, claimId: found.id, validatedBy: owner.id });
    return ok({ missionId, code, description: reward.description, claimedAt: found.claimedAt, validatedAt: validated.validatedAt });
  }
}

/** Situação da recompensa para quem vê a missão. */
export type RewardState =
  /** Ainda não concluiu (ou é visitante): mostra o prêmio como incentivo. */
  | "locked"
  /** Concluiu e ainda não resgatou: botão "Resgatar recompensa". */
  | "claimable"
  /** Concluiu, mas o estoque acabou. */
  | "sold_out"
  /** Já resgatou: mostra o código. */
  | "claimed";

export type MissionRewardView = {
  missionId: string;
  description: string;
  /** null = sem limite. */
  remaining: number | null;
  state: RewardState;
  claim: Pick<RewardClaim, "code" | "claimedAt" | "validatedAt"> | null;
};

/** Recompensa na tela da missão; null se a missão não tem recompensa ou deixou de dar prêmio real. */
export class GetMissionReward {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly userMissions: Pick<UserMissionRepository, "find">,
    private readonly rewards: Pick<MissionRewardRepository, "find">,
    private readonly claims: Pick<RewardClaimRepository, "findMine">,
  ) {}

  async execute(userId: string | null, missionId: string): Promise<MissionRewardView | null> {
    const reward = await this.rewards.find(missionId);
    if (!reward) return null;
    const claim = userId ? await this.claims.findMine(userId, missionId) : null;
    const base = { missionId, description: reward.description, remaining: remainingOf(reward) };
    // Quem já resgatou vê o código mesmo que a missão tenha mudado depois.
    if (claim) return { ...base, state: "claimed", claim: { code: claim.code, claimedAt: claim.claimedAt, validatedAt: claim.validatedAt } };

    const mission = await this.missions.findById(missionId);
    if (!mission || !allowsRealReward(mission)) return null;
    const completed = userId ? (await this.userMissions.find(userId, missionId))?.status === "completed" : false;
    const state: RewardState = !completed ? "locked" : isSoldOut(reward) ? "sold_out" : "claimable";
    return { ...base, state, claim: null };
  }
}

export type PartnerRewardPanel = {
  mission: Pick<MissionRecord, "id" | "title" | "status">;
  /** Todas as etapas por QR: pode vincular prêmio. */
  allowsRealReward: boolean;
  reward: MissionReward | null;
  /** Já resgatada: não pode mais mudar. */
  locked: boolean;
  validatedCount: number;
};

/** Portal (/parceiro/missoes/<id>/recompensa): só o parceiro dono; null para os demais. */
export class GetPartnerRewardPanel {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly rewards: Pick<MissionRewardRepository, "find" | "countValidated">,
  ) {}

  async execute(owner: RewardOwner, missionId: string): Promise<PartnerRewardPanel | null> {
    const owned = await ownedMission(this.missions, owner, missionId);
    if (!owned.ok) return null;
    const mission = owned.value;
    const reward = await this.rewards.find(missionId);
    return {
      mission: { id: mission.id, title: mission.title, status: mission.status },
      allowsRealReward: allowsRealReward(mission),
      reward,
      locked: reward ? isRewardLocked(reward) : false,
      validatedCount: reward ? await this.rewards.countValidated(owner.id, missionId) : 0,
    };
  }
}
