import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { isAvailable, type MissionRecord, type MissionRepository } from "../../domain/mission";
import { MAX_ACTIVE_MISSIONS, type UserMission, type UserMissionRepository } from "../../domain/user-mission";

/** Regras comuns de aceite (lista pública e oferta surpresa): no prazo, não a própria e dentro do limite de ativas. */
export async function acceptanceProblem(
  mission: Pick<MissionRecord, "status" | "startsAt" | "endsAt" | "ownerId">,
  userId: string,
  userMissions: Pick<UserMissionRepository, "countActive">,
  now: Date,
): Promise<BusinessRuleError | null> {
  if (!isAvailable(mission, now)) return new BusinessRuleError("mission_unavailable", "Esta missão não está disponível agora.");
  // Anti-fraude: quem criou tem o QR das etapas em mãos.
  if (mission.ownerId === userId) return new BusinessRuleError("own_mission", "Você não pode jogar uma missão que você criou.");
  if ((await userMissions.countActive(userId)) >= MAX_ACTIVE_MISSIONS) {
    return new BusinessRuleError("too_many_active_missions", `Você já tem ${MAX_ACTIVE_MISSIONS} missões em andamento. Conclua uma para aceitar outra.`);
  }
  return null;
}

/** RF28 — Aceitar uma missão disponível. Idempotente: aceitar de novo devolve o mesmo aceite. */
export class AcceptMission {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly userMissions: UserMissionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, missionId: string): Promise<Result<UserMission, DomainError>> {
    const mission = await this.missions.findById(missionId);
    if (!mission) return err(new NotFoundError("Missão"));

    const existing = await this.userMissions.find(userId, missionId);
    if (existing) return ok(existing);

    // Missão surpresa (#63) só pela oferta (RespondSurpriseOffer); a RLS confere de novo.
    if (mission.surprise) return err(new BusinessRuleError("surprise_requires_offer", "Esta é uma missão surpresa: ela só pode ser aceita quando aparecer para você."));

    const problem = await acceptanceProblem(mission, userId, this.userMissions, this.now());
    if (problem) return err(problem);

    return ok(await this.userMissions.accept(userId, missionId));
  }
}
