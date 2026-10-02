import type { Sql } from "@/shared/db/sql";
import type { StreamRecord } from "../domain/stream";
import type { AgentHeartbeat, AgentHeartbeatStore, HeartbeatInput } from "../features/privacy-heartbeat/privacy-heartbeat.use-case";
import { STREAM_COLUMNS, toStream, type StreamRow } from "./postgres-stream-repository";

type Row = { stream_id: string; privacy_mode: "on" | "off"; blur_mode: "faces" | "full"; fps: string; faces_per_frame: string; detector_status: string; received_at: Date };
const toBeat = (r: Row): AgentHeartbeat => ({ streamId: r.stream_id, privacyMode: r.privacy_mode, blurMode: r.blur_mode, fps: Number(r.fps), facesPerFrame: Number(r.faces_per_frame), detectorStatus: r.detector_status, receivedAt: r.received_at });

/** Tudo pelo sistema: o agente não é uma conta. A chave de transmissão é o segredo que o identifica. */
export class PostgresAgentHeartbeats implements AgentHeartbeatStore {
  constructor(private readonly sql: Sql) {}

  async streamByKey(streamKey: string): Promise<StreamRecord | null> {
    const columns = STREAM_COLUMNS.split(", ").map((c) => `s.${c}`).join(", ");
    const [row] = await this.sql.unsafe<StreamRow[]>(`select ${columns} from live.streams s join live.stream_credentials c on c.stream_id = s.id where c.stream_key = $1`, [streamKey]);
    return row ? toStream(row) : null;
  }

  async save(streamId: string, h: HeartbeatInput): Promise<AgentHeartbeat> {
    const [row] = await this.sql<Row[]>`
      insert into live.agent_heartbeats (stream_id, privacy_mode, blur_mode, fps, faces_per_frame, detector_status, received_at)
      values (${streamId}, ${h.privacy_mode}, ${h.blur_mode}, ${h.fps}, ${h.faces_per_frame}, ${h.detector_status}, now())
      on conflict (stream_id) do update set privacy_mode = excluded.privacy_mode, blur_mode = excluded.blur_mode, fps = excluded.fps,
        faces_per_frame = excluded.faces_per_frame, detector_status = excluded.detector_status, received_at = excluded.received_at
      returning stream_id, privacy_mode, blur_mode, fps, faces_per_frame, detector_status, received_at`;
    return toBeat(row);
  }

  async latest(streamIds: string[]): Promise<AgentHeartbeat[]> {
    if (streamIds.length === 0) return [];
    const rows = await this.sql<Row[]>`
      select stream_id, privacy_mode, blur_mode, fps, faces_per_frame, detector_status, received_at from live.agent_heartbeats where stream_id in ${this.sql(streamIds)}`;
    return rows.map(toBeat);
  }

  async pauseBySystem(streamId: string): Promise<StreamRecord | null> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx.unsafe<StreamRow[]>(`update live.streams set control = 'paused' where id = $1 and control = 'on' returning ${STREAM_COLUMNS}`, [streamId]);
      if (!row) return null;
      await tx`insert into live.stream_lifecycle_events (stream_id, source, kind, status_after, occurred_at) values (${streamId}, 'system', 'paused', 'paused', now())`;
      return toStream(row);
    }) as Promise<StreamRecord | null>;
  }
}
