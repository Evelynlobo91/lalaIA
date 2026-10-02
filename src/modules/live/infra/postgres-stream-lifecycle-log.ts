import type { Sql } from "@/shared/db/sql";
import { statusOf, type RecordedProviderEvent, type SignalState, type StreamLifecycleLog } from "../domain/stream";
import { STREAM_COLUMNS, toStream, type StreamRow } from "./postgres-stream-repository";

/**
 * Webhooks do provedor: grava o evento no log append-only e aplica o novo sinal na MESMA transação,
 * com a transmissão travada (`for update`): dois webhooks simultâneos da mesma live não se atropelam.
 * Roda com o papel do backend (o webhook não tem usuário); a autenticação é a assinatura.
 */
export class PostgresStreamLifecycleLog implements StreamLifecycleLog {
  constructor(private readonly sql: Sql) {}

  async recordProviderEvent(
    event: { eventId: string; providerStreamId: string; kind: string; occurredAt: Date },
    next: (current: SignalState) => SignalState,
  ): Promise<RecordedProviderEvent> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx.unsafe<StreamRow[]>(`select ${STREAM_COLUMNS} from live.streams where provider_stream_id = $1 for update`, [event.providerStreamId]);
      if (!row) return { outcome: "unknown_stream" } as const;
      const before = toStream(row);
      const signal = next({ signal: before.signal, signalChangedAt: before.signalChangedAt });

      const inserted = await tx`
        insert into live.stream_lifecycle_events (stream_id, source, kind, provider_event_id, status_after, occurred_at)
        values (${before.id}, 'provider', ${event.kind}, ${event.eventId}, ${statusOf(before.control, signal.signal)}, ${event.occurredAt})
        on conflict (provider_event_id) do nothing
        returning id`;
      if (inserted.length === 0) return { outcome: "duplicate" } as const;

      if (signal.signal === before.signal && signal.signalChangedAt.getTime() === before.signalChangedAt.getTime()) {
        return { outcome: "applied", before, after: before } as const;
      }
      const [updated] = await tx.unsafe<StreamRow[]>(
        `update live.streams set signal = $2, signal_changed_at = $3 where id = $1 returning ${STREAM_COLUMNS}`,
        [before.id, signal.signal, signal.signalChangedAt],
      );
      return { outcome: "applied", before, after: toStream(updated) } as const;
    }) as Promise<RecordedProviderEvent>;
  }
}
