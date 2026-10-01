import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { NewStream, PublicStreamReader, StreamControl, StreamEntityType, StreamRecord, StreamRepository, StreamSignal, StreamStatus, StreamTarget } from "../domain/stream";

type StreamRow = {
  id: string;
  owner_id: string;
  entity_type: StreamEntityType;
  entity_id: string;
  provider: string;
  provider_stream_id: string;
  playback_id: string;
  control: StreamControl;
  signal: StreamSignal;
  status: StreamStatus;
  signal_changed_at: Date;
  created_at: Date;
};

// Nunca inclui a chave: ela mora em live.stream_credentials, que só o dono lê.
export const STREAM_COLUMNS = "id, owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id, control, signal, status, signal_changed_at, created_at";

export const toStream = (r: StreamRow): StreamRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  provider: r.provider,
  providerStreamId: r.provider_stream_id,
  playbackId: r.playback_id,
  control: r.control,
  signal: r.signal,
  status: r.status,
  signalChangedAt: r.signal_changed_at,
  createdAt: r.created_at,
});

export type { StreamRow };

const UNIQUE_VIOLATION = "23505";

export class PostgresStreamRepository implements StreamRepository, PublicStreamReader {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<StreamRecord | null> {
    const [row] = await this.sql.unsafe<StreamRow[]>(`select ${STREAM_COLUMNS} from live.streams where id = $1`, [id]);
    return row ? toStream(row) : null;
  }

  async findByTarget({ entityType, entityId }: StreamTarget): Promise<StreamRecord | null> {
    const [row] = await this.sql.unsafe<StreamRow[]>(`select ${STREAM_COLUMNS} from live.streams where entity_type = $1 and entity_id = $2`, [entityType, entityId]);
    return row ? toStream(row) : null;
  }

  async listByOwner(ownerId: string): Promise<StreamRecord[]> {
    const rows = await this.sql.unsafe<StreamRow[]>(`select ${STREAM_COLUMNS} from live.streams where owner_id = $1 order by created_at desc`, [ownerId]);
    return rows.map(toStream);
  }

  async listLive(limit: number): Promise<StreamRecord[]> {
    const rows = await this.sql.unsafe<StreamRow[]>(`select ${STREAM_COLUMNS} from live.streams where status = 'live' order by signal_changed_at desc limit $1`, [limit]);
    return rows.map(toStream);
  }

  async create(actorId: string, stream: NewStream): Promise<StreamRecord | null> {
    try {
      return await asUser(
        actorId,
        async (tx) => {
          const [row] = await tx.unsafe<StreamRow[]>(
            `insert into live.streams (owner_id, entity_type, entity_id, provider, provider_stream_id, playback_id)
             values ($1, $2, $3, $4, $5, $6) returning ${STREAM_COLUMNS}`,
            [actorId, stream.entityType, stream.entityId, stream.provider, stream.providerStreamId, stream.playbackId],
          );
          await tx`insert into live.stream_credentials (stream_id, owner_id, stream_key) values (${row.id}, ${actorId}, ${stream.streamKey})`;
          return toStream(row);
        },
        this.sql,
      );
    } catch (error) {
      // Corrida: outro pedido criou a transmissão deste lugar/evento antes.
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  async saveKey(actorId: string, streamId: string, streamKey: string): Promise<boolean> {
    const rows = await asUser(
      actorId,
      (tx) => tx`update live.stream_credentials set stream_key = ${streamKey}, rotated_at = now() where stream_id = ${streamId} returning stream_id`,
      this.sql,
    );
    return rows.length === 1;
  }

  async keyFor(ownerId: string, streamId: string): Promise<string | null> {
    const [row] = await asUser(ownerId, (tx) => tx<{ stream_key: string }[]>`select stream_key from live.stream_credentials where stream_id = ${streamId}`, this.sql);
    return row?.stream_key ?? null;
  }
}
