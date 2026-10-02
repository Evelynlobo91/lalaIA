import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { SurpriseOffer, SurpriseOfferRepository, SurpriseOfferStatus } from "../domain/surprise";
import type { UserMission } from "../domain/user-mission";
import { USER_MISSION_COLUMNS, toUserMission } from "./postgres-user-mission-repository";

type Row = { id: string; user_id: string; mission_id: string; offered_at: Date; expires_at: Date; status: SurpriseOfferStatus };

const COLUMNS = "id, user_id, mission_id, offered_at, expires_at, status";

const toOffer = (r: Row): SurpriseOffer => ({ id: r.id, userId: r.user_id, missionId: r.mission_id, offeredAt: r.offered_at, expiresAt: r.expires_at, status: r.status });

/** Ofertas de missão surpresa. Tudo roda como a própria pessoa (asUser): a RLS só deixa ver, receber e responder as dela. */
export class PostgresSurpriseOfferRepository implements SurpriseOfferRepository {
  constructor(private readonly sql: Sql) {}

  async listOpen(userId: string, now: Date): Promise<SurpriseOffer[]> {
    const rows = await asUser(
      userId,
      (tx) => tx.unsafe<Row[]>(`select ${COLUMNS} from missions.surprise_offers where user_id = $1 and status = 'offered' and expires_at > $2 order by expires_at`, [userId, now]),
      this.sql,
    );
    return rows.map(toOffer);
  }

  async find(userId: string, missionId: string): Promise<SurpriseOffer | null> {
    const [row] = await asUser(userId, (tx) => tx.unsafe<Row[]>(`select ${COLUMNS} from missions.surprise_offers where user_id = $1 and mission_id = $2`, [userId, missionId]), this.sql);
    return row ? toOffer(row) : null;
  }

  async offeredMissionIds(userId: string): Promise<Set<string>> {
    const rows = await asUser(userId, (tx) => tx<{ mission_id: string }[]>`select mission_id from missions.surprise_offers where user_id = ${userId}`, this.sql);
    return new Set(rows.map((r) => r.mission_id));
  }

  async create(userId: string, missionId: string, expiresAt: Date): Promise<SurpriseOffer> {
    return asUser(
      userId,
      async (tx) => {
        await tx`insert into missions.surprise_offers (user_id, mission_id, expires_at) values (${userId}, ${missionId}, ${expiresAt}) on conflict (user_id, mission_id) do nothing`;
        const [row] = await tx.unsafe<Row[]>(`select ${COLUMNS} from missions.surprise_offers where user_id = $1 and mission_id = $2`, [userId, missionId]);
        return toOffer(row);
      },
      this.sql,
    );
  }

  async accept(userId: string, missionId: string): Promise<UserMission> {
    return asUser(
      userId,
      async (tx) => {
        // Primeiro o aceite (a RLS exige a oferta ainda aberta), depois a oferta vira "aceita".
        await tx`insert into missions.user_missions (user_id, mission_id) values (${userId}, ${missionId}) on conflict (user_id, mission_id) do nothing`;
        await tx`update missions.surprise_offers set status = 'accepted', responded_at = now() where user_id = ${userId} and mission_id = ${missionId} and status = 'offered'`;
        const [row] = await tx.unsafe<Parameters<typeof toUserMission>[0][]>(`select ${USER_MISSION_COLUMNS} from missions.user_missions where user_id = $1 and mission_id = $2`, [
          userId,
          missionId,
        ]);
        return toUserMission(row);
      },
      this.sql,
    );
  }

  async dismiss(userId: string, missionId: string): Promise<void> {
    await asUser(userId, (tx) => tx`update missions.surprise_offers set status = 'dismissed', responded_at = now() where user_id = ${userId} and mission_id = ${missionId} and status = 'offered'`, this.sql);
  }
}
