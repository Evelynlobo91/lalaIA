import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import { geofenceFor } from "../domain/geofence";
import type { MissionDraft, MissionRecord, MissionRepository, MissionStatus, MissionStep, ValidationKind } from "../domain/mission";

type MissionRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  xp: number;
  starts_at: Date;
  ends_at: Date;
  status: MissionStatus;
  created_at: Date;
  surprise: boolean;
  estimated_minutes: number | null;
  cost_cents: number | null;
};

type StepRow = {
  id: string;
  mission_id: string;
  position: number;
  title: string;
  place_id: string;
  validation: ValidationKind;
  geofence_radius_m: number | null;
  dwell_minutes: number | null;
};

const COLUMNS = "id, owner_id, title, description, xp, starts_at, ends_at, status, created_at, surprise, estimated_minutes, cost_cents";
const STEP_COLUMNS = "id, mission_id, position, title, place_id, validation, geofence_radius_m, dwell_minutes";

const toStep = (r: StepRow): MissionStep => ({
  id: r.id,
  missionId: r.mission_id,
  position: r.position,
  title: r.title,
  placeId: r.place_id,
  validation: r.validation,
  geofence: r.geofence_radius_m === null ? null : { radiusMeters: r.geofence_radius_m, dwellMinutes: r.dwell_minutes ?? 0 },
});

/** Monta missões com as etapas em ordem (duas consultas, sem N+1). */
async function withSteps(db: Sql | Tx, rows: MissionRow[]): Promise<MissionRecord[]> {
  if (rows.length === 0) return [];
  const steps = await db.unsafe<StepRow[]>(`select ${STEP_COLUMNS} from missions.mission_steps where mission_id = any($1::uuid[]) order by mission_id, position`, [
    rows.map((r) => r.id),
  ]);
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    xp: r.xp,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    createdAt: r.created_at,
    surprise: r.surprise,
    estimatedMinutes: r.estimated_minutes,
    costCents: r.cost_cents,
    steps: steps.filter((s) => s.mission_id === r.id).map(toStep),
  }));
}

/**
 * Grava as etapas por posição: a etapa N mantém o mesmo id ao editar (os QR codes impressos continuam
 * valendo); posições que sobraram são removidas.
 */
async function saveSteps(tx: Tx, missionId: string, draft: MissionDraft) {
  for (const [i, s] of draft.steps.entries()) {
    const geofence = geofenceFor(s.validation, s.geofence);
    await tx`
      insert into missions.mission_steps (mission_id, position, title, place_id, validation, geofence_radius_m, dwell_minutes)
      values (${missionId}, ${i + 1}, ${s.title}, ${s.placeId}, ${s.validation}, ${geofence?.radiusMeters ?? null}, ${geofence?.dwellMinutes ?? null})
      on conflict (mission_id, position) do update set title = excluded.title, place_id = excluded.place_id, validation = excluded.validation,
        geofence_radius_m = excluded.geofence_radius_m, dwell_minutes = excluded.dwell_minutes`;
  }
  await tx`delete from missions.mission_steps where mission_id = ${missionId} and position > ${draft.steps.length}`;
}

export class PostgresMissionRepository implements MissionRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<MissionRecord | null> {
    const rows = await this.sql.unsafe<MissionRow[]>(`select ${COLUMNS} from missions.missions where id = $1`, [id]);
    return (await withSteps(this.sql, rows))[0] ?? null;
  }

  /** Para aceitar: missão de parceiro suspenso não existe (#144). Quem já aceitou continua vendo a sua. */
  async findVisibleById(id: string): Promise<MissionRecord | null> {
    const rows = await this.sql.unsafe<MissionRow[]>(`select ${COLUMNS} from missions.missions where id = $1 and not platform.owner_suspended(owner_id)`, [id]);
    return (await withSteps(this.sql, rows))[0] ?? null;
  }

  async listByOwner(ownerId: string): Promise<MissionRecord[]> {
    const rows = await this.sql.unsafe<MissionRow[]>(`select ${COLUMNS} from missions.missions where owner_id = $1 order by created_at desc`, [ownerId]);
    return withSteps(this.sql, rows);
  }

  async listAvailable(now: Date, limit: number): Promise<MissionRecord[]> {
    const rows = await this.sql.unsafe<MissionRow[]>(
      `select ${COLUMNS} from missions.missions where status = 'active' and not surprise and starts_at <= $1 and ends_at > $1 and not platform.owner_suspended(owner_id) order by ends_at, id limit $2`,
      [now, limit],
    );
    return withSteps(this.sql, rows);
  }

  async listAvailableSurprises(now: Date, limit: number): Promise<MissionRecord[]> {
    const rows = await this.sql.unsafe<MissionRow[]>(
      `select ${COLUMNS} from missions.missions where status = 'active' and surprise and starts_at <= $1 and ends_at > $1 and not platform.owner_suspended(owner_id) order by ends_at, id limit $2`,
      [now, limit],
    );
    return withSteps(this.sql, rows);
  }

  async findByIds(ids: string[]): Promise<MissionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.sql.unsafe<MissionRow[]>(`select ${COLUMNS} from missions.missions where id = any($1::uuid[])`, [ids]);
    return withSteps(this.sql, rows);
  }

  async findByStepId(stepId: string): Promise<MissionRecord | null> {
    const rows = await this.sql.unsafe<MissionRow[]>(
      `select ${COLUMNS} from missions.missions where id = (select mission_id from missions.mission_steps where id = $1)`,
      [stepId],
    );
    return (await withSteps(this.sql, rows))[0] ?? null;
  }

  async create(actorId: string, d: MissionDraft): Promise<MissionRecord> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<MissionRow[]>(
          `insert into missions.missions (owner_id, title, description, xp, starts_at, ends_at, surprise, estimated_minutes, cost_cents)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${COLUMNS}`,
          [actorId, d.title, d.description, d.xp, d.startsAt, d.endsAt, d.surprise ?? false, d.estimatedMinutes ?? null, d.costCents ?? null],
        );
        await saveSteps(tx, rows[0].id, d);
        return (await withSteps(tx, rows))[0];
      },
      this.sql,
    );
  }

  async update(actorId: string, id: string, d: MissionDraft, options: { saveSteps: boolean }): Promise<MissionRecord | null> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<MissionRow[]>(
          `update missions.missions set title = $2, description = $3, xp = $4, starts_at = $5, ends_at = $6, surprise = $7,
             estimated_minutes = $8, cost_cents = $9
           where id = $1 and status = 'active' returning ${COLUMNS}`,
          [id, d.title, d.description, d.xp, d.startsAt, d.endsAt, d.surprise ?? false, d.estimatedMinutes ?? null, d.costCents ?? null],
        );
        if (rows.length === 0) return null;
        if (options.saveSteps) await saveSteps(tx, id, d);
        return (await withSteps(tx, rows))[0];
      },
      this.sql,
    );
  }

  async archive(actorId: string, id: string): Promise<MissionRecord | null> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<MissionRow[]>(
          `update missions.missions set status = 'archived', archived_at = now() where id = $1 and status = 'active' returning ${COLUMNS}`,
          [id],
        );
        return (await withSteps(tx, rows))[0] ?? null;
      },
      this.sql,
    );
  }
}
