import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type {
  Offer,
  OfferDraft,
  OfferRepository,
  OfferStatus,
  OfferTarget,
  OfferTargetType,
  RedeemOutcome,
  Redemption,
  RedemptionForValidation,
  RedemptionRepository,
} from "../domain/offer";

type OfferRow = {
  id: string;
  partner_id: string;
  target_type: OfferTargetType;
  target_id: string;
  title: string;
  description: string;
  starts_at: Date;
  ends_at: Date;
  max_redemptions: number | null;
  redeemed_count: number;
  status: OfferStatus;
  created_at: Date;
};

type RedemptionRow = { id: string; offer_id: string; user_id: string; code: string; redeemed_at: Date; validated_at: Date | null };

const OFFER_COLUMNS = "id, partner_id, target_type, target_id, title, description, starts_at, ends_at, max_redemptions, redeemed_count, status, created_at";
const O_COLUMNS = OFFER_COLUMNS.split(", ")
  .map((c) => `o.${c} as o_${c}`)
  .join(", ");
const REDEMPTION_COLUMNS = "id, offer_id, user_id, code, redeemed_at, validated_at";
const R_COLUMNS = REDEMPTION_COLUMNS.split(", ")
  .map((c) => `r.${c}`)
  .join(", ");

const toOffer = (r: OfferRow): Offer => ({
  id: r.id,
  partnerId: r.partner_id,
  target: { type: r.target_type, id: r.target_id },
  title: r.title,
  description: r.description,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  maxRedemptions: r.max_redemptions,
  redeemedCount: r.redeemed_count,
  status: r.status,
  createdAt: r.created_at,
});

const toRedemption = (r: RedemptionRow): Redemption => ({
  id: r.id,
  offerId: r.offer_id,
  userId: r.user_id,
  code: r.code,
  redeemedAt: r.redeemed_at,
  validatedAt: r.validated_at,
});

/** Linha com as colunas da oferta prefixadas (`o_`) → oferta. */
const offerFromJoined = (row: Record<string, unknown>): Offer =>
  toOffer(Object.fromEntries(OFFER_COLUMNS.split(", ").map((c) => [c, row[`o_${c}`]])) as OfferRow);

const errorCode = (error: unknown) => String((error as { code?: string }).code ?? "");
const constraintOf = (error: unknown) => String((error as { constraint_name?: string }).constraint_name ?? "");

export class PostgresOfferRepository implements OfferRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<Offer | null> {
    const rows = await this.sql.unsafe<OfferRow[]>(`select ${OFFER_COLUMNS} from partners.offers where id = $1`, [id]);
    return rows[0] ? toOffer(rows[0]) : null;
  }

  async listCurrentFor(target: OfferTarget, now: Date): Promise<Offer[]> {
    const rows = await this.sql.unsafe<OfferRow[]>(
      `select ${OFFER_COLUMNS} from partners.offers
       where target_type = $1 and target_id = $2 and status = 'active' and ends_at > $3
         and exists (select 1 from partners.partners p where p.id = partner_id and p.status = 'approved')
       order by starts_at, ends_at, id`,
      [target.type, target.id, now],
    );
    return rows.map(toOffer);
  }

  async listByPartner(partnerId: string): Promise<Array<Offer & { validatedCount: number }>> {
    const rows = await this.sql.unsafe<Array<OfferRow & { validated_count: number }>>(
      `select ${OFFER_COLUMNS},
              (select count(*)::int from partners.offer_redemptions r where r.offer_id = o.id and r.validated_at is not null) as validated_count
       from partners.offers o where partner_id = $1 order by created_at desc`,
      [partnerId],
    );
    return rows.map((r) => ({ ...toOffer(r), validatedCount: r.validated_count }));
  }

  async create(actorId: string, partnerId: string, d: OfferDraft): Promise<Offer> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<OfferRow[]>(
          `insert into partners.offers (partner_id, target_type, target_id, title, description, starts_at, ends_at, max_redemptions)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${OFFER_COLUMNS}`,
          [partnerId, d.target.type, d.target.id, d.title, d.description, d.startsAt, d.endsAt, d.maxRedemptions],
        );
        return toOffer(rows[0]);
      },
      this.sql,
    );
  }

  async update(actorId: string, id: string, d: OfferDraft): Promise<Offer | null> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<OfferRow[]>(
          `update partners.offers
              set target_type = $2, target_id = $3, title = $4, description = $5, starts_at = $6, ends_at = $7, max_redemptions = $8
            where id = $1 and status = 'active' returning ${OFFER_COLUMNS}`,
          [id, d.target.type, d.target.id, d.title, d.description, d.startsAt, d.endsAt, d.maxRedemptions],
        );
        return rows[0] ? toOffer(rows[0]) : null;
      },
      this.sql,
    );
  }

  async end(actorId: string, id: string): Promise<Offer | null> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<OfferRow[]>(
          `update partners.offers set status = 'ended', ended_at = now() where id = $1 and status = 'active' returning ${OFFER_COLUMNS}`,
          [id],
        );
        return rows[0] ? toOffer(rows[0]) : null;
      },
      this.sql,
    );
  }
}

export class PostgresRedemptionRepository implements RedemptionRepository {
  constructor(private readonly sql: Sql) {}

  async findMine(userId: string, offerId: string): Promise<Redemption | null> {
    return (await this.findMineFor(userId, [offerId]))[0] ?? null;
  }

  async findMineFor(userId: string, offerIds: string[]): Promise<Redemption[]> {
    if (offerIds.length === 0) return [];
    return asUser(
      userId,
      async (tx) => {
        const rows = await tx.unsafe<RedemptionRow[]>(
          `select ${REDEMPTION_COLUMNS} from partners.offer_redemptions where user_id = $1 and offer_id = any($2::uuid[])`,
          [userId, offerIds],
        );
        return rows.map(toRedemption);
      },
      this.sql,
    );
  }

  async listMine(userId: string): Promise<Array<Redemption & { offer: Offer }>> {
    return asUser(
      userId,
      async (tx) => {
        const rows = await tx.unsafe<Array<RedemptionRow & Record<string, unknown>>>(
          `select ${R_COLUMNS}, ${O_COLUMNS}
             from partners.offer_redemptions r join partners.offers o on o.id = r.offer_id
            where r.user_id = $1 order by r.redeemed_at desc`,
          [userId],
        );
        return rows.map((r) => ({ ...toRedemption(r), offer: offerFromJoined(r) }));
      },
      this.sql,
    );
  }

  async redeem(userId: string, offerId: string, code: string): Promise<RedeemOutcome> {
    try {
      return await asUser(
        userId,
        async (tx: Tx): Promise<RedeemOutcome> => {
          // 1 por pessoa: o unique (offer_id, user_id) espera o resgate concorrente da mesma pessoa e não duplica.
          // O limite total é o trigger AFTER INSERT (lock na linha da oferta).
          const inserted = await tx.unsafe<RedemptionRow[]>(
            `insert into partners.offer_redemptions (offer_id, user_id, code) values ($1, $2, $3)
             on conflict (offer_id, user_id) do nothing returning ${REDEMPTION_COLUMNS}`,
            [offerId, userId, code],
          );
          if (inserted[0]) return { kind: "redeemed", redemption: toRedemption(inserted[0]), created: true };
          const existing = await tx.unsafe<RedemptionRow[]>(`select ${REDEMPTION_COLUMNS} from partners.offer_redemptions where offer_id = $1 and user_id = $2`, [
            offerId,
            userId,
          ]);
          return { kind: "redeemed", redemption: toRedemption(existing[0]), created: false };
        },
        this.sql,
      );
    } catch (error) {
      if (errorCode(error) === "LAESG") return { kind: "sold_out" };
      // RLS: fora da validade, encerrada ou a própria oferta (a situação mudou entre a leitura e a gravação).
      if (errorCode(error) === "42501") return { kind: "unavailable" };
      if (errorCode(error) === "23505" && constraintOf(error) === "offer_redemptions_code_key") return { kind: "code_taken" };
      throw error;
    }
  }

  async findForPartner(actorId: string, partnerId: string, code: string): Promise<RedemptionForValidation | null> {
    return asUser(
      actorId,
      async (tx) => {
        // A RLS só mostra resgates das ofertas do próprio parceiro; o filtro por partner_id é a primeira camada.
        const rows = await tx.unsafe<Array<RedemptionRow & Record<string, unknown>>>(
          `select ${R_COLUMNS}, ${O_COLUMNS}
             from partners.offer_redemptions r join partners.offers o on o.id = r.offer_id
            where r.code = $1 and o.partner_id = $2`,
          [code, partnerId],
        );
        return rows[0] ? { ...toRedemption(rows[0]), offer: offerFromJoined(rows[0]) } : null;
      },
      this.sql,
    );
  }

  async markValidated(actorId: string, redemptionId: string): Promise<Redemption | null> {
    return asUser(
      actorId,
      async (tx) => {
        const rows = await tx.unsafe<RedemptionRow[]>(
          `update partners.offer_redemptions set validated_at = now(), validated_by = $2
            where id = $1 and validated_at is null returning ${REDEMPTION_COLUMNS}`,
          [redemptionId, actorId],
        );
        return rows[0] ? toRedemption(rows[0]) : null;
      },
      this.sql,
    );
  }
}
