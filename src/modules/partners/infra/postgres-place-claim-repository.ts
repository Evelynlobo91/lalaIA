import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { ClaimStatus, PlaceClaim, PlaceClaimRepository } from "../domain/place-claim";

type Row = { id: string; partner_id: string; place_id: string; status: ClaimStatus; rejection_reason: string | null; created_at: Date };
const COLUMNS = "c.id, c.partner_id, c.place_id, c.status, c.rejection_reason, c.created_at";

const toClaim = (r: Row): PlaceClaim => ({
  id: r.id,
  partnerId: r.partner_id,
  placeId: r.place_id,
  status: r.status,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
});

/** Tudo como o usuário da sessão (asUser): RLS garante que parceiro só vê/pede o que é dele e só admin revisa. */
export class PostgresPlaceClaimRepository implements PlaceClaimRepository {
  constructor(private readonly sql: Sql) {}

  async request(actorId: string, partnerId: string, placeId: string): Promise<PlaceClaim> {
    const [row] = await asUser(
      actorId,
      (tx) => tx.unsafe<Row[]>(
        `insert into partners.place_claims as c (partner_id, place_id) values ($1, $2)
         on conflict (partner_id, place_id) do update set status = 'pending', rejection_reason = null, reviewed_by = null, reviewed_at = null
           where c.status = 'rejected'
         returning ${COLUMNS}`,
        [partnerId, placeId],
      ),
      this.sql,
    );
    // Já pendente/aprovado: o upsert não altera nada; devolve o pedido existente.
    return row ? toClaim(row) : (await this.listMine(actorId, partnerId)).find((c) => c.placeId === placeId)!;
  }

  async listMine(actorId: string, partnerId: string): Promise<PlaceClaim[]> {
    const rows = await asUser(actorId, (tx) => tx.unsafe<Row[]>(`select ${COLUMNS} from partners.place_claims c where c.partner_id = $1 order by c.created_at desc`, [partnerId]), this.sql);
    return rows.map(toClaim);
  }

  async listForReview(actorId: string) {
    const rows = await asUser(
      actorId,
      (tx) => tx.unsafe<(Row & { business_name: string; owner_id: string })[]>(
        `select ${COLUMNS}, p.business_name, p.owner_id
         from partners.place_claims c join partners.partners p on p.id = c.partner_id
         where c.status = 'pending' order by c.created_at`,
      ),
      this.sql,
    );
    return rows.map((r) => ({ ...toClaim(r), businessName: r.business_name, ownerId: r.owner_id }));
  }

  async review(actorId: string, claimId: string, decision: { status: "approved" } | { status: "rejected"; reason: string }) {
    const reason = decision.status === "rejected" ? decision.reason : null;
    const [row] = await asUser(
      actorId,
      (tx) => tx.unsafe<(Row & { owner_id: string })[]>(
        `update partners.place_claims c set status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now()
         from partners.partners p
         where c.id = $1 and p.id = c.partner_id
         returning ${COLUMNS}, p.owner_id`,
        [claimId, decision.status, reason, actorId],
      ),
      this.sql,
    );
    return row ? { ...toClaim(row), ownerId: row.owner_id } : null;
  }
}
