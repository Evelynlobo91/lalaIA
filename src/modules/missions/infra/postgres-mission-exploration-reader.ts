import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { MissionExploration, MissionExplorationReader } from "../features/exploration/exploration";

/** Uma consulta, como o próprio usuário (RLS): missões concluídas, etapas concluídas e lugares dessas etapas. */
export class PostgresMissionExplorationReader implements MissionExplorationReader {
  constructor(private readonly sql: Sql) {}

  async explorationOf(userId: string): Promise<MissionExploration> {
    const [row] = await asUser(
      userId,
      (tx) => tx<{ completed: number; check_ins: number; places: string[] }[]>`
        select
          (select count(*)::int from missions.user_missions where user_id = ${userId} and status = 'completed') as completed,
          (select count(*)::int from missions.step_completions where user_id = ${userId}) as check_ins,
          coalesce((
            select array_agg(distinct s.place_id)
            from missions.step_completions c join missions.mission_steps s on s.id = c.step_id
            where c.user_id = ${userId}
          ), '{}'::uuid[]) as places`,
      this.sql,
    );
    return { completedMissions: row.completed, checkIns: row.check_ins, visitedPlaceIds: row.places };
  }
}
