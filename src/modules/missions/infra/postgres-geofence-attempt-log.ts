import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { GeofenceAttempt, GeofenceAttemptLog, GeofenceOutcome } from "../domain/geofence";

type Row = { outcome: GeofenceOutcome; distance_m: number | null; attempted_at: Date };

const toAttempt = (r: Row): GeofenceAttempt => ({ outcome: r.outcome, distanceMeters: r.distance_m, attemptedAt: r.attempted_at });

/** Tentativas de check-in por GPS (append-only). Roda como o próprio usuário (asUser): a RLS só deixa ver e gravar as dele. */
export class PostgresGeofenceAttemptLog implements GeofenceAttemptLog {
  constructor(private readonly sql: Sql) {}

  async recent(userId: string, stepId: string, since: Date): Promise<GeofenceAttempt[]> {
    const rows = await asUser(
      userId,
      (tx) => tx<Row[]>`
        select outcome, distance_m, attempted_at from missions.geofence_checkins
        where user_id = ${userId} and step_id = ${stepId} and attempted_at >= ${since}
        order by attempted_at`,
      this.sql,
    );
    return rows.map(toAttempt);
  }

  async record(userId: string, stepId: string, attempt: { outcome: GeofenceOutcome; distanceMeters: number | null }): Promise<GeofenceAttempt> {
    const [row] = await asUser(
      userId,
      (tx) => tx<Row[]>`
        insert into missions.geofence_checkins (user_id, step_id, outcome, distance_m)
        values (${userId}, ${stepId}, ${attempt.outcome}, ${attempt.distanceMeters})
        returning outcome, distance_m, attempted_at`,
      this.sql,
    );
    return toAttempt(row);
  }

  /** Para a exportação LGPD: as tentativas da pessoa (sem coordenada, que nunca é gravada). */
  async listByUser(userId: string): Promise<Array<GeofenceAttempt & { stepId: string }>> {
    const rows = await asUser(
      userId,
      (tx) => tx<(Row & { step_id: string })[]>`
        select step_id, outcome, distance_m, attempted_at from missions.geofence_checkins where user_id = ${userId} order by attempted_at desc`,
      this.sql,
    );
    return rows.map((r) => ({ stepId: r.step_id, ...toAttempt(r) }));
  }
}
