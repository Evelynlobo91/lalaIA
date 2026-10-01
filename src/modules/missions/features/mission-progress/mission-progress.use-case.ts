import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import { isAvailable, xpSplit, type MissionPlace, type MissionPlaces, type MissionRecord, type MissionRepository, type ValidationKind } from "../../domain/mission";
import { progressOf, stepStates, type Progress, type StepCompletionReader, type StepState } from "../../domain/progress";
import type { UserMission, UserMissionRepository } from "../../domain/user-mission";

export type StepProgressView = {
  id: string;
  position: number;
  title: string;
  validation: ValidationKind;
  place: MissionPlace | null;
  state: StepState;
  completedAt: Date | null;
};

export type MissionProgressView = {
  mission: Pick<MissionRecord, "id" | "title" | "description" | "xp" | "startsAt" | "endsAt" | "status"> & { available: boolean };
  xp: { perStep: number; completionBonus: number };
  /** null: visitante ou quem ainda não aceitou. */
  userMission: UserMission | null;
  progress: Progress;
  steps: StepProgressView[];
};

/** RF29 — Etapas da missão com o status de cada uma (feita/próxima/pendente) e o percentual concluído. */
export class GetMissionProgress {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly userMissions: Pick<UserMissionRepository, "find">,
    private readonly completions: Pick<StepCompletionReader, "listFor">,
    private readonly places: Pick<MissionPlaces, "summaries">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `userId` vem da sessão (ou null para visitante). */
  async execute(userId: string | null, missionId: string): Promise<Result<MissionProgressView, NotFoundError>> {
    const mission = await this.missions.findById(missionId);
    if (!mission) return err(new NotFoundError("Missão"));

    const userMission = userId ? await this.userMissions.find(userId, missionId) : null;
    const available = isAvailable(mission, this.now());
    // Missão fora da janela ou encerrada só aparece para quem já a aceitou.
    if (!available && !userMission) return err(new NotFoundError("Missão"));

    const [completions, places] = await Promise.all([
      userMission && userId ? this.completions.listFor(userId, userMission.id) : Promise.resolve([]),
      this.places.summaries([...new Set(mission.steps.map((s) => s.placeId))]),
    ]);
    const placeById = new Map(places.map((p) => [p.id, { id: p.id, name: p.name, neighborhood: p.neighborhood }]));
    const completedAt = new Map(completions.map((c) => [c.stepId, c.completedAt]));
    const states = stepStates(mission.steps, completions);

    return ok({
      mission: {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        xp: mission.xp,
        startsAt: mission.startsAt,
        endsAt: mission.endsAt,
        status: mission.status,
        available,
      },
      xp: xpSplit(mission.xp, mission.steps.length),
      userMission,
      progress: progressOf(mission.steps, completions),
      steps: mission.steps.map((s) => ({
        id: s.id,
        position: s.position,
        title: s.title,
        validation: s.validation,
        place: placeById.get(s.placeId) ?? null,
        state: userMission ? states.get(s.id)! : "pending",
        completedAt: completedAt.get(s.id) ?? null,
      })),
    });
  }
}
