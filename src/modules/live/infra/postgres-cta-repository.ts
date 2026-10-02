import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { CtaPriority, CtaRecord, CtaSchedule, CtaType } from "../domain/cta";
import type { StreamCtaReader } from "../features/active-cta/active-cta.use-case";
import type { CtaRepository, CtaToSave } from "../features/schedule-cta/schedule-cta.use-case";

type CtaRow = {
  id: string;
  stream_id: string;
  owner_id: string;
  type: CtaType;
  ref_id: string | null;
  href: string;
  external: boolean;
  title: string;
  body: string | null;
  button_label: string;
  priority: number;
  schedule_kind: CtaSchedule["kind"];
  starts_at: Date | null;
  ends_at: Date | null;
  offset_minutes: number | null;
  duration_minutes: number | null;
  interval_minutes: number | null;
  created_at: Date;
};

export const CTA_COLUMNS =
  "id, stream_id, owner_id, type, ref_id, href, external, title, body, button_label, priority, schedule_kind, starts_at, ends_at, offset_minutes, duration_minutes, interval_minutes, created_at";

function scheduleOf(r: CtaRow): CtaSchedule {
  if (r.schedule_kind === "absolute") return { kind: "absolute", startsAt: r.starts_at!, endsAt: r.ends_at! };
  if (r.schedule_kind === "relative") return { kind: "relative", offsetMinutes: r.offset_minutes!, durationMinutes: r.duration_minutes! };
  return { kind: "recurring", intervalMinutes: r.interval_minutes!, durationMinutes: r.duration_minutes! };
}

export const toCta = (r: CtaRow): CtaRecord => ({
  id: r.id,
  streamId: r.stream_id,
  ownerId: r.owner_id,
  type: r.type,
  refId: r.ref_id,
  href: r.href,
  external: r.external,
  title: r.title,
  body: r.body,
  buttonLabel: r.button_label,
  priority: r.priority as CtaPriority,
  schedule: scheduleOf(r),
  createdAt: r.created_at,
});

export type { CtaRow };

/** Colunas do agendamento, na ordem: starts_at, ends_at, offset_minutes, duration_minutes, interval_minutes. */
function scheduleValues(s: CtaSchedule): [Date | null, Date | null, number | null, number | null, number | null] {
  if (s.kind === "absolute") return [s.startsAt, s.endsAt, null, null, null];
  if (s.kind === "relative") return [null, null, s.offsetMinutes, s.durationMinutes, null];
  return [null, null, null, s.durationMinutes, s.intervalMinutes];
}

const contentValues = (c: CtaToSave) => [c.type, c.refId, c.href, c.external, c.title, c.body, c.buttonLabel, c.priority, c.schedule.kind, ...scheduleValues(c.schedule)];

export class PostgresCtaRepository implements CtaRepository, StreamCtaReader {
  constructor(private readonly sql: Sql) {}

  async listByStream(actorId: string, streamId: string): Promise<CtaRecord[]> {
    // A RLS só mostra os CTAs do próprio dono; o filtro por dono é a primeira camada.
    const rows = await asUser(
      actorId,
      (tx) => tx.unsafe<CtaRow[]>(`select ${CTA_COLUMNS} from live.ctas where stream_id = $1 and owner_id = $2 order by priority, created_at`, [streamId, actorId]),
      this.sql,
    );
    return rows.map(toCta);
  }

  async find(actorId: string, ctaId: string): Promise<CtaRecord | null> {
    const [row] = await asUser(actorId, (tx) => tx.unsafe<CtaRow[]>(`select ${CTA_COLUMNS} from live.ctas where id = $1 and owner_id = $2`, [ctaId, actorId]), this.sql);
    return row ? toCta(row) : null;
  }

  async create(actorId: string, cta: CtaToSave): Promise<CtaRecord> {
    const [row] = await asUser(
      actorId,
      (tx) =>
        tx.unsafe<CtaRow[]>(
          `insert into live.ctas (stream_id, owner_id, type, ref_id, href, external, title, body, button_label, priority, schedule_kind, starts_at, ends_at, offset_minutes, duration_minutes, interval_minutes)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning ${CTA_COLUMNS}`,
          [cta.streamId, actorId, ...contentValues(cta)],
        ),
      this.sql,
    );
    return toCta(row);
  }

  async update(actorId: string, ctaId: string, cta: CtaToSave): Promise<CtaRecord | null> {
    const [row] = await asUser(
      actorId,
      (tx) =>
        tx.unsafe<CtaRow[]>(
          `update live.ctas set type = $3, ref_id = $4, href = $5, external = $6, title = $7, body = $8, button_label = $9, priority = $10,
                  schedule_kind = $11, starts_at = $12, ends_at = $13, offset_minutes = $14, duration_minutes = $15, interval_minutes = $16
            where id = $1 and stream_id = $2 and owner_id = $17 returning ${CTA_COLUMNS}`,
          [ctaId, cta.streamId, ...contentValues(cta), actorId],
        ),
      this.sql,
    );
    return row ? toCta(row) : null;
  }

  // Sistema (sem asUser): leitura pública para resolver a chamada ativa. O público não lê a tabela.
  async listForStream(streamId: string): Promise<CtaRecord[]> {
    const rows = await this.sql.unsafe<CtaRow[]>(`select ${CTA_COLUMNS} from live.ctas where stream_id = $1 order by priority, created_at`, [streamId]);
    return rows.map(toCta);
  }

  async remove(actorId: string, ctaId: string): Promise<boolean> {
    const rows = await asUser(actorId, (tx) => tx`delete from live.ctas where id = ${ctaId} and owner_id = ${actorId} returning id`, this.sql);
    return rows.length > 0;
  }
}
