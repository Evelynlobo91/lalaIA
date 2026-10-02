import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { MissionParticipation, UserMission, UserMissionRepository, UserMissionStatus } from "../domain/user-mission";

type Row = { id: string; user_id: string; mission_id: string; status: UserMissionStatus; accepted_at: Date; completed_at: Date | null };

export const USER_MISSION_COLUMNS = "id, user_id, mission_id, status, accepted_at, completed_at";

export const toUserMission = (r: Row): UserMission => ({
  id: r.id,
  userId: r.user_id,
  missionId: r.mission_id,
  status: r.status,
  acceptedAt: r.accepted_at,
  completedAt: r.completed_at,
});

/** Aceites do usuário. Tudo roda como o próprio usuário (asUser): a RLS só deixa ver e criar os seus. */
export class PostgresUserMissionRepository implements UserMissionRepository, MissionParticipation {
  constructor(private readonly sql: Sql) {}

  async find(userId: string, missionId: string): Promise<UserMission | null> {
    const [row] = await asUser(userId, (tx) => tx.unsafe<Row[]>(`select ${USER_MISSION_COLUMNS} from missions.user_missions where user_id = $1 and mission_id = $2`, [userId, missionId]), this.sql);
    return row ? toUserMission(row) : null;
  }

  async listByUser(userId: string): Promise<UserMission[]> {
    const rows = await asUser(userId, (tx) => tx.unsafe<Row[]>(`select ${USER_MISSION_COLUMNS} from missions.user_missions where user_id = $1 order by accepted_at desc`, [userId]), this.sql);
    return rows.map(toUserMission);
  }

  async countActive(userId: string): Promise<number> {
    const [row] = await asUser(userId, (tx) => tx<{ n: number }[]>`select count(*)::int as n from missions.user_missions where user_id = ${userId} and status = 'active'`, this.sql);
    return row.n;
  }

  async accept(userId: string, missionId: string): Promise<UserMission> {
    return asUser(
      userId,
      async (tx) => {
        await tx`insert into missions.user_missions (user_id, mission_id) values (${userId}, ${missionId}) on conflict (user_id, mission_id) do nothing`;
        const [row] = await tx.unsafe<Row[]>(`select ${USER_MISSION_COLUMNS} from missions.user_missions where user_id = $1 and mission_id = $2`, [userId, missionId]);
        return toUserMission(row);
      },
      this.sql,
    );
  }

  async hasParticipants(missionId: string): Promise<boolean> {
    const [row] = await this.sql<{ has: boolean }[]>`select missions.has_participants(${missionId}) as has`;
    return row.has;
  }
}
