import { z } from "zod";

/** O que a pessoa já explorou pelas missões (para o perfil de explorador e as conquistas do progression). */
export type MissionExploration = {
  /** Missões concluídas (todas as etapas). */
  completedMissions: number;
  /** Etapas concluídas (check-ins validados no balcão). */
  checkIns: number;
  /** Lugares visitados: os das etapas concluídas, sem repetição. Só ids (sem join com places). */
  visitedPlaceIds: string[];
};

export interface MissionExplorationReader {
  /** Lê como o próprio usuário (asUser): a RLS só mostra as conclusões dele. */
  explorationOf(userId: string): Promise<MissionExploration>;
}

const userIdSchema = z.uuid();

/** Contagens de exploração do usuário. Id inválido → tudo zerado (nunca consulta o banco). */
export class GetMissionExploration {
  constructor(private readonly reader: MissionExplorationReader) {}

  async execute(userId: string): Promise<MissionExploration> {
    if (!userIdSchema.safeParse(userId).success) return { completedMissions: 0, checkIns: 0, visitedPlaceIds: [] };
    return this.reader.explorationOf(userId);
  }
}
