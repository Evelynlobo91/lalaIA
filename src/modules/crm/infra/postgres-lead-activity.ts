import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { DueFollowUp, FollowUp, LeadActivity, LeadNote } from "../domain/follow-up";

type FollowUpRow = { id: string; lead_id: string; description: string; due_on: string; done_at: Date | null };

// `due_on::text`: a data vem como "YYYY-MM-DD", sem virar Date (que traria fuso junto).
const FOLLOW_UP_COLUMNS = "f.id, f.lead_id, f.description, f.due_on::text as due_on, f.done_at";
const toFollowUp = (r: FollowUpRow): FollowUp => ({ id: r.id, leadId: r.lead_id, description: r.description, dueOn: r.due_on, doneAt: r.done_at });

/** Anotações e follow-ups, como o usuário da sessão (RLS por capacidade). */
export class PostgresLeadActivity implements LeadActivity {
  constructor(private readonly sql: Sql) {}

  private as<T>(actorId: string, fn: (tx: Tx) => Promise<T>) {
    return asUser(actorId, fn, this.sql);
  }

  async addNote(actorId: string, leadId: string, body: string): Promise<boolean> {
    const rows = await this.as(actorId, (tx) =>
      // `select ... from crm.leads`: sem o lead (ou sem acesso a ele), nada é inserido.
      tx`insert into crm.lead_notes (lead_id, author_id, body) select id, ${actorId}, ${body} from crm.leads where id = ${leadId} returning id`,
    );
    return rows.length > 0;
  }

  async notes(actorId: string, leadId: string): Promise<LeadNote[]> {
    const rows = await this.as(actorId, (tx) => tx<{ id: string; body: string; author_id: string | null; created_at: Date }[]>`
      select id::text as id, body, author_id, created_at from crm.lead_notes where lead_id = ${leadId} order by created_at desc, id desc limit 200`);
    return rows.map((r) => ({ id: r.id, body: r.body, authorId: r.author_id, createdAt: r.created_at }));
  }

  async setNextStep(actorId: string, leadId: string, description: string, dueOn: string): Promise<FollowUp | null> {
    return this.as(actorId, async (tx) => {
      const [lead] = await tx`select id from crm.leads where id = ${leadId}`;
      if (!lead) return null;
      // Um em aberto por lead: se já existe, é reescrito (não conta como concluído).
      const [updated] = await tx.unsafe<FollowUpRow[]>(
        `update crm.lead_follow_ups f set description = $2, due_on = $3::date where f.lead_id = $1 and f.done_at is null returning ${FOLLOW_UP_COLUMNS}`,
        [leadId, description, dueOn],
      );
      if (updated) return toFollowUp(updated);
      const [row] = await tx.unsafe<FollowUpRow[]>(
        `insert into crm.lead_follow_ups as f (lead_id, description, due_on, created_by) values ($1, $2, $3::date, $4) returning ${FOLLOW_UP_COLUMNS}`,
        [leadId, description, dueOn, actorId],
      );
      return toFollowUp(row);
    });
  }

  async openFollowUp(actorId: string, leadId: string): Promise<FollowUp | null> {
    const [row] = await this.as(actorId, (tx) => tx.unsafe<FollowUpRow[]>(`select ${FOLLOW_UP_COLUMNS} from crm.lead_follow_ups f where f.lead_id = $1 and f.done_at is null`, [leadId]));
    return row ? toFollowUp(row) : null;
  }

  async complete(actorId: string, followUpId: string): Promise<FollowUp | null> {
    const [row] = await this.as(actorId, (tx) =>
      tx.unsafe<FollowUpRow[]>(`update crm.lead_follow_ups f set done_at = now(), done_by = $2 where f.id = $1 and f.done_at is null returning ${FOLLOW_UP_COLUMNS}`, [followUpId, actorId]),
    );
    return row ? toFollowUp(row) : null;
  }

  async dueFor(actorId: string, ownerId: string, until: string): Promise<DueFollowUp[]> {
    const rows = await this.as(actorId, (tx) =>
      tx.unsafe<Array<FollowUpRow & { business_name: string; contact_name: string; contact_phone: string | null }>>(
        `select ${FOLLOW_UP_COLUMNS}, l.business_name, l.contact_name, l.contact_phone
         from crm.lead_follow_ups f join crm.leads l on l.id = f.lead_id
         where f.done_at is null and f.due_on <= $2::date and l.owner_id = $1
         order by f.due_on, f.created_at
         limit 200`,
        [ownerId, until],
      ),
    );
    return rows.map((r) => ({ ...toFollowUp(r), businessName: r.business_name, contactName: r.contact_name, contactPhone: r.contact_phone }));
  }
}
