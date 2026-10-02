import type { Sql } from "@/shared/db/sql";
import { PRESENCE_WINDOW_SECONDS } from "../features/live-presence/live-presence.use-case";
import type { AudienceReader } from "../features/scale/scale.use-case";

/** Sistema: só contagens (lives no ar, abas assistindo, amostras por minuto). */
export class PostgresAudienceReader implements AudienceReader {
  constructor(private readonly sql: Sql) {}

  async now(): Promise<{ liveStreams: number; viewers: number }> {
    const [row] = await this.sql<{ live_streams: number; viewers: number }[]>`
      select (select count(*) from live.streams where status = 'live')::int as live_streams,
             (select count(*) from live.viewers v join live.streams s on s.id = v.stream_id and s.status = 'live'
               where v.seen_at >= now() - make_interval(secs => ${PRESENCE_WINDOW_SECONDS}))::int as viewers`;
    return { liveStreams: row.live_streams, viewers: row.viewers };
  }

  async month(since: Date): Promise<{ viewerMinutes: number; peakViewers: number }> {
    const [row] = await this.sql<{ viewer_minutes: string; peak: number }[]>`
      with per_minute as (select minute, sum(viewers)::int as viewers from live.audience_samples where minute >= ${since} group by minute)
      select coalesce(sum(viewers), 0) as viewer_minutes, coalesce(max(viewers), 0)::int as peak from per_minute`;
    return { viewerMinutes: Number(row.viewer_minutes), peakViewers: row.peak };
  }
}
