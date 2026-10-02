import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { PartnerApplication, PartnerApplicationData, PartnerKind, PartnerRepository, PartnerReviewItem, PartnerStatus } from "../domain/partner";

type Row = {
  id: string;
  owner_id: string;
  kind: PartnerKind;
  business_name: string;
  phone: string;
  instagram: string | null;
  cnpj: string | null;
  description: string;
  status: PartnerStatus;
  rejection_reason: string | null;
  suspension_reason: string | null;
  created_at: Date;
};

const COLUMNS = "id, owner_id, kind, business_name, phone, instagram, cnpj, description, status, rejection_reason, suspension_reason, created_at";

const toApplication = (r: Row): PartnerApplication => ({
  id: r.id,
  ownerId: r.owner_id,
  kind: r.kind,
  businessName: r.business_name,
  phone: r.phone,
  instagram: r.instagram,
  cnpj: r.cnpj,
  description: r.description,
  status: r.status,
  rejectionReason: r.rejection_reason,
  suspensionReason: r.suspension_reason,
  createdAt: r.created_at,
});

/** Todas as operações rodam como o usuário da sessão (asUser): as políticas RLS valem também aqui. */
export class PostgresPartnerRepository implements PartnerRepository {
  constructor(
    private readonly sql: Sql,
    private readonly users: (ids: string[]) => Promise<Array<{ id: string; displayName: string; email: string }>>,
  ) {}

  private as<T>(actorId: string, fn: (tx: Tx) => Promise<T>) {
    return asUser(actorId, fn, this.sql);
  }

  async findByOwner(actorId: string): Promise<PartnerApplication | null> {
    const [row] = await this.as(actorId, (tx) => tx.unsafe<Row[]>(`select ${COLUMNS} from partners.partners where owner_id = $1`, [actorId]));
    return row ? toApplication(row) : null;
  }

  async submit(actorId: string, d: PartnerApplicationData): Promise<PartnerApplication> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `insert into partners.partners (owner_id, kind, business_name, phone, instagram, cnpj, description)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (owner_id) do update set
           kind = excluded.kind, business_name = excluded.business_name, phone = excluded.phone,
           instagram = excluded.instagram, cnpj = excluded.cnpj, description = excluded.description,
           status = 'pending', rejection_reason = null, reviewed_by = null, reviewed_at = null
         returning ${COLUMNS}`,
        [actorId, d.kind, d.businessName, d.phone, d.instagram, d.cnpj, d.description],
      ),
    );
    return toApplication(row);
  }

  async listForReview(actorId: string, status: PartnerStatus): Promise<PartnerReviewItem[]> {
    const rows = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(`select ${COLUMNS} from partners.partners where status = $1 order by created_at`, [status]),
    );
    return this.withOwners(rows);
  }

  async listActive(actorId: string): Promise<PartnerReviewItem[]> {
    const rows = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(`select ${COLUMNS} from partners.partners where status in ('approved', 'suspended') order by business_name, id`),
    );
    return this.withOwners(rows);
  }

  private async withOwners(rows: Row[]): Promise<PartnerReviewItem[]> {
    // Quem pediu: pela API pública do módulo identity (nada de join com tabelas de outro módulo).
    const owners = new Map((await this.users(rows.map((r) => r.owner_id))).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...toApplication(r), ownerName: owners.get(r.owner_id)?.displayName ?? "—", ownerEmail: owners.get(r.owner_id)?.email ?? "—" }));
  }

  async review(
    actorId: string,
    partnerId: string,
    decision: { status: "approved" } | { status: "rejected"; reason: string },
  ): Promise<PartnerApplication | null> {
    const reason = decision.status === "rejected" ? decision.reason : null;
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `update partners.partners
         set status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = now()
         where id = $1 and status <> 'suspended'
         returning ${COLUMNS}`,
        [partnerId, decision.status, reason, actorId],
      ),
    );
    return row ? toApplication(row) : null;
  }

  async suspend(actorId: string, partnerId: string, reason: string): Promise<PartnerApplication | null> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `update partners.partners
         set status = 'suspended', suspension_reason = $2, suspended_by = $3, suspended_at = now()
         where id = $1 and status = 'approved'
         returning ${COLUMNS}`,
        [partnerId, reason, actorId],
      ),
    );
    return row ? toApplication(row) : null;
  }

  async reactivate(actorId: string, partnerId: string): Promise<PartnerApplication | null> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `update partners.partners
         set status = 'approved', suspension_reason = null, suspended_by = null, suspended_at = null
         where id = $1 and status = 'suspended'
         returning ${COLUMNS}`,
        [partnerId],
      ),
    );
    return row ? toApplication(row) : null;
  }
}
