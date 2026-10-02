import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { Lead, LeadData, LeadFilter, LeadRepository, LeadSource, LeadStage } from "../domain/lead";
import type { LeadReports, SourceCount } from "../features/lead-reports/lead-reports";

type Row = {
  id: string;
  business_name: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  source: LeadSource;
  owner_id: string | null;
  stage: LeadStage;
  lost_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export const LEAD_COLUMNS = "id, business_name, contact_name, contact_phone, contact_email, source, owner_id, stage, lost_reason, created_at, updated_at";

export const toLead = (r: Row): Lead => ({
  id: r.id,
  businessName: r.business_name,
  contactName: r.contact_name,
  contactPhone: r.contact_phone,
  contactEmail: r.contact_email,
  source: r.source,
  ownerId: r.owner_id,
  stage: r.stage,
  lostReason: r.lost_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type { Row as LeadRow };

/** Todas as operações rodam como o usuário da sessão (asUser): as políticas RLS por capacidade valem também aqui. */
export class PostgresLeadRepository implements LeadRepository, LeadReports {
  constructor(private readonly sql: Sql) {}

  private as<T>(actorId: string, fn: (tx: Tx) => Promise<T>) {
    return asUser(actorId, fn, this.sql);
  }

  async create(actorId: string, d: LeadData): Promise<Lead> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `insert into crm.leads (business_name, contact_name, contact_phone, contact_email, source, owner_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning ${LEAD_COLUMNS}`,
        [d.businessName, d.contactName, d.contactPhone, d.contactEmail, d.source, d.ownerId, actorId],
      ),
    );
    return toLead(row);
  }

  async update(actorId: string, leadId: string, d: LeadData): Promise<Lead | null> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `update crm.leads set business_name = $2, contact_name = $3, contact_phone = $4, contact_email = $5, source = $6, owner_id = $7
         where id = $1 returning ${LEAD_COLUMNS}`,
        [leadId, d.businessName, d.contactName, d.contactPhone, d.contactEmail, d.source, d.ownerId],
      ),
    );
    return row ? toLead(row) : null;
  }

  async findById(actorId: string, leadId: string): Promise<Lead | null> {
    const [row] = await this.as(actorId, (tx) => tx.unsafe<Row[]>(`select ${LEAD_COLUMNS} from crm.leads where id = $1`, [leadId]));
    return row ? toLead(row) : null;
  }

  async list(actorId: string, limit: number, filter: LeadFilter = {}): Promise<Lead[]> {
    // Filtro ausente vira null, e a condição deixa passar tudo.
    const rows = await this.as(actorId, (tx) =>
      tx.unsafe<Row[]>(
        `select ${LEAD_COLUMNS} from crm.leads
         where ($2::text is null or stage = $2) and ($3::text is null or source = $3) and ($4::uuid is null or owner_id = $4)
         order by updated_at desc, id limit $1`,
        [limit, filter.stage ?? null, filter.source ?? null, filter.ownerId ?? null],
      ),
    );
    return rows.map(toLead);
  }

  async countsBySource(actorId: string, since: Date | null): Promise<SourceCount[]> {
    return this.as(actorId, (tx) =>
      tx.unsafe<SourceCount[]>(
        `select source, count(*)::int as total, count(*) filter (where stage = 'ativo')::int as active, count(*) filter (where stage = 'perdido')::int as lost
         from crm.leads where ($1::timestamptz is null or created_at >= $1) group by source`,
        [since],
      ),
    );
  }
}
