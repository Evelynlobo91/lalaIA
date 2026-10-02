import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { InviteData, InviteKind, InviteRecord, InviteStore } from "../domain/conversion";

type Row = {
  id: string;
  lead_id: string;
  business_name: string;
  kind: InviteKind;
  phone: string;
  description: string;
  place_id: string | null;
  created_by: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  accepted_at: Date | null;
  accepted_by: string | null;
};

export class PostgresInviteStore implements InviteStore {
  constructor(private readonly sql: Sql) {}

  async create(actorId: string, leadId: string, tokenHash: string, d: InviteData, expiresAt: Date): Promise<{ id: string } | null> {
    return asUser(
      actorId,
      async (tx) => {
        const [lead] = await tx`select id from crm.leads where id = ${leadId}`;
        if (!lead) return null;
        // Um convite em aberto por lead: o link anterior deixa de valer.
        await tx`update crm.partner_invites set revoked_at = now() where lead_id = ${leadId} and accepted_at is null and revoked_at is null`;
        const [row] = await tx<{ id: string }[]>`
          insert into crm.partner_invites (lead_id, token_hash, kind, phone, description, place_id, expires_at, created_by)
          values (${leadId}, ${tokenHash}, ${d.kind}, ${d.phone}, ${d.description}, ${d.placeId}, ${expiresAt}, ${actorId})
          returning id`;
        return { id: row.id };
      },
      this.sql,
    );
  }

  async openFor(actorId: string, leadId: string): Promise<{ id: string; createdAt: Date; expiresAt: Date } | null> {
    const [row] = await asUser(
      actorId,
      (tx) => tx<{ id: string; created_at: Date; expires_at: Date }[]>`
        select id, created_at, expires_at from crm.partner_invites where lead_id = ${leadId} and accepted_at is null and revoked_at is null`,
      this.sql,
    );
    return row ? { id: row.id, createdAt: row.created_at, expiresAt: row.expires_at } : null;
  }

  // Sistema (sem asUser): quem abre o link não é do time; a autorização é o próprio token.
  async findByTokenHash(tokenHash: string): Promise<InviteRecord | null> {
    const [r] = await this.sql<Row[]>`
      select i.id, i.lead_id, l.business_name, i.kind, i.phone, i.description, i.place_id, i.created_by, i.expires_at, i.revoked_at, i.accepted_at, i.accepted_by
      from crm.partner_invites i join crm.leads l on l.id = i.lead_id
      where i.token_hash = ${tokenHash}`;
    if (!r) return null;
    return {
      id: r.id,
      leadId: r.lead_id,
      businessName: r.business_name,
      kind: r.kind,
      phone: r.phone,
      description: r.description,
      placeId: r.place_id,
      createdBy: r.created_by,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      acceptedAt: r.accepted_at,
      acceptedBy: r.accepted_by,
    };
  }

  async markAccepted(inviteId: string, userId: string, partnerId: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const [invite] = await tx<{ lead_id: string; created_by: string | null }[]>`
        update crm.partner_invites set accepted_at = now(), accepted_by = ${userId}, partner_id = ${partnerId}
        where id = ${inviteId} and accepted_at is null and revoked_at is null
        returning lead_id, created_by`;
      if (!invite) return false;
      // O lead vira "parceiro ativo", com o registro no histórico em nome de quem gerou o convite.
      const [lead] = await tx<{ previous: string }[]>`
        with before as (select id, stage from crm.leads where id = ${invite.lead_id} and stage <> 'ativo' for update)
        update crm.leads l set stage = 'ativo', lost_reason = null from before where l.id = before.id returning before.stage as previous`;
      if (lead) {
        await tx`insert into crm.lead_stage_history (lead_id, from_stage, to_stage, changed_by) values (${invite.lead_id}, ${lead.previous}, 'ativo', ${invite.created_by})`;
      }
      return true;
    }) as Promise<boolean>;
  }
}
