import type { MissionPlace, MissionPlaces, MissionRecord, MissionRepository } from "../../domain/mission";
import type { Progress, StepCompletionReader } from "../../domain/progress";
import type { UserMission, UserMissionRepository } from "../../domain/user-mission";

/** Card de missão para listas públicas: dados da missão + lugares das etapas (sem repetir). */
export type MissionCard = {
  id: string;
  title: string;
  description: string;
  xp: number;
  startsAt: Date;
  endsAt: Date;
  stepCount: number;
  places: MissionPlace[];
};

export type MyMission = MissionCard & { userMission: UserMission; progress: Progress };

const MAX_LISTED = 50;

/** Monta os cards buscando os lugares de todas as missões numa consulta só. */
export async function toCards(missions: MissionRecord[], places: Pick<MissionPlaces, "summaries">): Promise<MissionCard[]> {
  const found = await places.summaries([...new Set(missions.flatMap((m) => m.steps.map((s) => s.placeId)))]);
  const byId = new Map(found.map((p) => [p.id, { id: p.id, name: p.name, neighborhood: p.neighborhood }]));
  return missions.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    xp: m.xp,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    stepCount: m.steps.length,
    places: [...new Set(m.steps.map((s) => s.placeId))].flatMap((id) => byId.get(id) ?? []),
  }));
}

/** Missões disponíveis agora (ativas e dentro da janela). */
export class ListAvailableMissions {
  constructor(
    private readonly missions: Pick<MissionRepository, "listAvailable">,
    private readonly places: Pick<MissionPlaces, "summaries">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<MissionCard[]> {
    return toCards(await this.missions.listAvailable(this.now(), MAX_LISTED), this.places);
  }
}

/** Missões aceitas pelo usuário (ativas e concluídas), da mais recente para a mais antiga. */
export class ListMyMissions {
  constructor(
    private readonly missions: Pick<MissionRepository, "findByIds">,
    private readonly userMissions: Pick<UserMissionRepository, "listByUser">,
    private readonly completions: Pick<StepCompletionReader, "countsByUserMission">,
    private readonly places: Pick<MissionPlaces, "summaries">,
  ) {}

  async execute(userId: string): Promise<MyMission[]> {
    const [accepted, counts] = await Promise.all([this.userMissions.listByUser(userId), this.completions.countsByUserMission(userId)]);
    const cards = new Map((await toCards(await this.missions.findByIds(accepted.map((a) => a.missionId)), this.places)).map((c) => [c.id, c]));
    return accepted.flatMap((userMission) => {
      const card = cards.get(userMission.missionId);
      if (!card) return [];
      const done = Math.min(counts.get(userMission.id) ?? 0, card.stepCount);
      return [{ ...card, userMission, progress: { done, total: card.stepCount, percent: card.stepCount ? Math.round((done / card.stepCount) * 100) : 0 } }];
    });
  }
}
