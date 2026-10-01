import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { EventDraft, EventRecord, EventRepository, EventStatus } from "../domain/event";

type Row = {
  id: string;
  owner_id: string;
  place_id: string;
  title: string;
  description: string;
  category: string;
  starts_at: Date;
  ends_at: Date;
  price_cents: number;
  status: EventStatus;
  created_at: Date;
};

const COLUMNS = "id, owner_id, place_id, title, description, category, starts_at, ends_at, price_cents, status, created_at";

const toRecord = (r: Row): EventRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  placeId: r.place_id,
  title: r.title,
  description: r.description,
  category: (isCategoryId(r.category) ? r.category : "passeios") as CategoryId,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  priceCents: r.price_cents,
  status: r.status,
  createdAt: r.created_at,
});

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<EventRecord | null> {
    const [row] = await this.sql.unsafe<Row[]>(`select ${COLUMNS} from events.events where id = $1`, [id]);
    return row ? toRecord(row) : null;
  }

  async listByOwner(ownerId: string): Promise<EventRecord[]> {
    const rows = await this.sql.unsafe<Row[]>(`select ${COLUMNS} from events.events where owner_id = $1 order by starts_at desc`, [ownerId]);
    return rows.map(toRecord);
  }

  async create(actorId: string, d: EventDraft): Promise<EventRecord> {
    const [row] = await asUser(
      actorId,
      (tx) =>
        tx.unsafe<Row[]>(
          `insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, price_cents)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${COLUMNS}`,
          [actorId, d.placeId, d.title, d.description, d.category, d.startsAt, d.endsAt, d.priceCents],
        ),
      this.sql,
    );
    return toRecord(row);
  }

  async update(actorId: string, id: string, d: EventDraft): Promise<EventRecord | null> {
    const [row] = await asUser(
      actorId,
      (tx) =>
        tx.unsafe<Row[]>(
          `update events.events set place_id = $2, title = $3, description = $4, category = $5, starts_at = $6, ends_at = $7, price_cents = $8
           where id = $1 and status = 'scheduled' returning ${COLUMNS}`,
          [id, d.placeId, d.title, d.description, d.category, d.startsAt, d.endsAt, d.priceCents],
        ),
      this.sql,
    );
    return row ? toRecord(row) : null;
  }

  async cancel(actorId: string, id: string): Promise<EventRecord | null> {
    const [row] = await asUser(
      actorId,
      (tx) => tx.unsafe<Row[]>(`update events.events set status = 'cancelled', cancelled_at = now() where id = $1 and status = 'scheduled' returning ${COLUMNS}`, [id]),
      this.sql,
    );
    return row ? toRecord(row) : null;
  }
}
