import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { StepCompletion, StepCompletionReader, StepCompletionWriter } from "../domain/progress";

/** Etapas concluídas. Tudo roda como o próprio usuário (asUser): a RLS só deixa ver e gravar as dele. */
export class PostgresStepCompletionRepository implements StepCompletionReader, StepCompletionWriter {
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

  async complete(userId: string, userMissionId: string, stepId: string): Promise<{ recorded: boolean; missionCompleted: boolean }> {
    return asUser(
      userId,
      async (tx) => {
        const inserted = await tx`
          insert into missions.step_completions (user_mission_id, step_id, user_id) values (${userMissionId}, ${stepId}, ${userId})
          on conflict (user_mission_id, step_id) do nothing returning id`;
        if (inserted.length === 0) return { recorded: false, missionCompleted: false };
        // Conclui só se TODAS as etapas estão feitas (a RLS confere de novo) e só uma vez (status = 'active').
        const completed = await tx`
          update missions.user_missions um set status = 'completed', completed_at = now()
          where um.id = ${userMissionId} and um.user_id = ${userId} and um.status = 'active'
            and (select count(*) from missions.step_completions c where c.user_mission_id = um.id)
              = (select count(*) from missions.mission_steps s where s.mission_id = um.mission_id)
          returning um.id`;
        return { recorded: true, missionCompleted: completed.length > 0 };
      },
      this.sql,
    );
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
