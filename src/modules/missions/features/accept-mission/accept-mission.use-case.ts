import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { isAvailable, type MissionRepository } from "../../domain/mission";
import { MAX_ACTIVE_MISSIONS, type UserMission, type UserMissionRepository } from "../../domain/user-mission";

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

    if (!isAvailable(mission, this.now())) return err(new BusinessRuleError("mission_unavailable", "Esta missão não está disponível agora."));
    // Anti-fraude: quem criou tem o QR das etapas em mãos.
    if (mission.ownerId === userId) return err(new BusinessRuleError("own_mission", "Você não pode jogar uma missão que você criou."));
    if ((await this.userMissions.countActive(userId)) >= MAX_ACTIVE_MISSIONS) {
      return err(new BusinessRuleError("too_many_active_missions", `Você já tem ${MAX_ACTIVE_MISSIONS} missões em andamento. Conclua uma para aceitar outra.`));
    }

    return ok(await this.userMissions.accept(userId, missionId));
  }
}
