import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { ClaimOutcome, MissionReward, MissionRewardRepository, MyRewardClaim, RewardClaim, RewardClaimRepository, RewardDraft } from "../domain/reward";

type RewardRow = { mission_id: string; description: string; stock: number | null; claimed_count: number; created_at: Date };
type ClaimRow = { id: string; mission_id: string; user_id: string; code: string; claimed_at: Date; validated_at: Date | null };

const REWARD_COLUMNS = "mission_id, description, stock, claimed_count, created_at";
const CLAIM_COLUMNS = "id, mission_id, user_id, code, claimed_at, validated_at";
const C_COLUMNS = CLAIM_COLUMNS.split(", ")
  .map((c) => `c.${c}`)
  .join(", ");

const toReward = (r: RewardRow): MissionReward => ({
  missionId: r.mission_id,
  description: r.description,
  stock: r.stock,
  claimedCount: r.claimed_count,
  createdAt: r.created_at,
});

const toClaim = (r: ClaimRow): RewardClaim => ({
  id: r.id,
  missionId: r.mission_id,
  userId: r.user_id,
  code: r.code,
  claimedAt: r.claimed_at,
  validatedAt: r.validated_at,
});

const errorCode = (error: unknown) => String((error as { code?: string }).code ?? "");
const constraintOf = (error: unknown) => String((error as { constraint_name?: string }).constraint_name ?? "");

/** Recompensas das missões. Leitura pública; escrita como o parceiro (asUser): a RLS confere dono, papel e etapas por QR. */
export class PostgresMissionRewardRepository implements MissionRewardRepository {
  constructor(private readonly sql: Sql) {}

  async find(missionId: string): Promise<MissionReward | null> {
    const rows = await this.sql.unsafe<RewardRow[]>(`select ${REWARD_COLUMNS} from missions.mission_rewards where mission_id = $1`, [missionId]);
    return rows[0] ? toReward(rows[0]) : null;
  }

  async save(actorId: string, missionId: string, draft: RewardDraft): Promise<MissionReward> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<RewardRow[]>(
          `insert into missions.mission_rewards (mission_id, description, stock) values ($1, $2, $3)
           on conflict (mission_id) do update set description = excluded.description, stock = excluded.stock
           returning ${REWARD_COLUMNS}`,
          [missionId, draft.description, draft.stock],
        );
        return toReward(rows[0]);
      },
      this.sql,
    );
  }

  async countValidated(actorId: string, missionId: string): Promise<number> {
    // Como o dono (RLS): só conta os resgates das próprias missões.
    const [row] = await asUser(
      actorId,
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from missions.reward_claims where mission_id = ${missionId} and validated_at is not null`,
      this.sql,
    );
    return row.n;
  }
}

/** Resgates de recompensa. Tudo roda como o usuário (asUser): a RLS só deixa ver os próprios (ou os da própria missão). */
export class PostgresRewardClaimRepository implements RewardClaimRepository {
  constructor(private readonly sql: Sql) {}

  async findMine(userId: string, missionId: string): Promise<RewardClaim | null> {
    const rows = await asUser(
      userId,
      (tx) => tx.unsafe<ClaimRow[]>(`select ${CLAIM_COLUMNS} from missions.reward_claims where user_id = $1 and mission_id = $2`, [userId, missionId]),
      this.sql,
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }

  async listMine(userId: string): Promise<MyRewardClaim[]> {
    const rows = await asUser(
      userId,
      (tx) =>
        tx.unsafe<Array<ClaimRow & { mission_title: string; description: string }>>(
          `select ${C_COLUMNS}, m.title as mission_title, r.description
             from missions.reward_claims c
             join missions.mission_rewards r on r.mission_id = c.mission_id
             join missions.missions m on m.id = c.mission_id
            where c.user_id = $1 order by c.claimed_at desc`,
          [userId],
        ),
      this.sql,
    );
    return rows.map((r) => ({ ...toClaim(r), missionTitle: r.mission_title, description: r.description }));
  }

  async claim(userId: string, missionId: string, code: string): Promise<ClaimOutcome> {
    try {
      return await asUser(
        userId,
        async (tx: Tx): Promise<ClaimOutcome> => {
          // 1 por pessoa: o unique (mission_id, user_id) espera o resgate concorrente da mesma pessoa e não duplica.
          // O estoque é o trigger AFTER INSERT (lock na linha da recompensa).
          const inserted = await tx.unsafe<ClaimRow[]>(
            `insert into missions.reward_claims (mission_id, user_id, code) values ($1, $2, $3)
             on conflict (mission_id, user_id) do nothing returning ${CLAIM_COLUMNS}`,
            [missionId, userId, code],
          );
          if (inserted[0]) return { kind: "claimed", claim: toClaim(inserted[0]), created: true };
          const existing = await tx.unsafe<ClaimRow[]>(`select ${CLAIM_COLUMNS} from missions.reward_claims where mission_id = $1 and user_id = $2`, [missionId, userId]);
          return { kind: "claimed", claim: toClaim(existing[0]), created: false };
        },
        this.sql,
      );
    } catch (error) {
      if (errorCode(error) === "LARSG") return { kind: "sold_out" };
      // RLS: missão não concluída ou que deixou de dar prêmio real (a situação mudou entre a leitura e a gravação).
      if (errorCode(error) === "42501") return { kind: "unavailable" };
      if (errorCode(error) === "23505" && constraintOf(error) === "reward_claims_code_key") return { kind: "code_taken" };
      throw error;
    }
  }

  async findForOwner(actorId: string, missionId: string, code: string): Promise<RewardClaim | null> {
    // A RLS só mostra resgates das missões do próprio parceiro; o filtro pela missão é a primeira camada.
    const rows = await asUser(
      actorId,
      (tx) => tx.unsafe<ClaimRow[]>(`select ${CLAIM_COLUMNS} from missions.reward_claims where code = $1 and mission_id = $2`, [code, missionId]),
      this.sql,
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }

  async markValidated(actorId: string, claimId: string): Promise<RewardClaim | null> {
    const rows = await asUser(
      actorId,
      (tx) =>
        tx.unsafe<ClaimRow[]>(
          `update missions.reward_claims set validated_at = now(), validated_by = $2
            where id = $1 and validated_at is null returning ${CLAIM_COLUMNS}`,
          [claimId, actorId],
        ),
      this.sql,
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }
}
