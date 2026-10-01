import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { StepCompletion, StepCompletionReader } from "../domain/progress";

/** Etapas concluídas. Tudo roda como o próprio usuário (asUser): a RLS só deixa ver e gravar as dele. */
export class PostgresStepCompletionRepository implements StepCompletionReader {
  constructor(private readonly sql: Sql) {}

  async listFor(userId: string, userMissionId: string): Promise<StepCompletion[]> {
    const rows = await asUser(
      userId,
      (tx) => tx<{ step_id: string; completed_at: Date }[]>`
        select step_id, completed_at from missions.step_completions
        where user_id = ${userId} and user_mission_id = ${userMissionId} order by completed_at`,
      this.sql,
    );
    return rows.map((r) => ({ stepId: r.step_id, completedAt: r.completed_at }));
  }

  async countsByUserMission(userId: string): Promise<Map<string, number>> {
    const rows = await asUser(
      userId,
      (tx) => tx<{ user_mission_id: string; n: number }[]>`
        select user_mission_id, count(*)::int as n from missions.step_completions where user_id = ${userId} group by user_mission_id`,
      this.sql,
    );
    return new Map(rows.map((r) => [r.user_mission_id, r.n]));
  }
}
