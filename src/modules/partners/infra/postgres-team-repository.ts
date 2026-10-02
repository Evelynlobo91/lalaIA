import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { Membership, TeamMember, TeamRepository } from "../features/team-members/team-members.use-case";

type Row = { id: string; email: string; created_at: Date };

const UNIQUE_VIOLATION = "23505";

export class PostgresTeamRepository implements TeamRepository {
  constructor(private readonly sql: Sql) {}

  async list(actorId: string, partnerId: string): Promise<TeamMember[]> {
    const rows = await asUser(actorId, (tx) => tx<Row[]>`select id, email, created_at from partners.team_members where partner_id = ${partnerId} order by created_at`, this.sql);
    if (rows.length === 0) return [];
    // Sistema: o dono não lê auth.users; aqui só se sabe se já existe conta confirmada com o e-mail convidado.
    const joined = await this.sql<{ email: string }[]>`
      select lower(email) as email from auth.users where lower(email) in ${this.sql(rows.map((r) => r.email))} and email_confirmed_at is not null`;
    const emails = new Set(joined.map((j) => j.email));
    return rows.map((r) => ({ id: r.id, email: r.email, invitedAt: r.created_at, joined: emails.has(r.email) }));
  }

  async add(actorId: string, partnerId: string, email: string): Promise<TeamMember | null> {
    try {
      const [row] = await asUser(
        actorId,
        (tx) => tx<Row[]>`insert into partners.team_members (partner_id, email, invited_by) values (${partnerId}, ${email}, ${actorId}) returning id, email, created_at`,
        this.sql,
      );
      return { id: row.id, email: row.email, invitedAt: row.created_at, joined: false };
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  async remove(actorId: string, partnerId: string, memberId: string): Promise<boolean> {
    const rows = await asUser(actorId, (tx) => tx`delete from partners.team_members where id = ${memberId} and partner_id = ${partnerId} returning id`, this.sql);
    return rows.length > 0;
  }

  // Sistema (sem asUser): o membro não lê a tabela da equipe. O userId vem sempre da sessão.
  async membershipsOf(userId: string): Promise<Membership[]> {
    const rows = await this.sql<{ partner_id: string; business_name: string }[]>`
      select p.id as partner_id, p.business_name
      from partners.team_members m
      join partners.partners p on p.id = m.partner_id
      join auth.users u on lower(u.email) = m.email
      where u.id = ${userId} and u.email_confirmed_at is not null and p.status = 'approved'
      order by p.business_name`;
    return rows.map((r) => ({ partnerId: r.partner_id, businessName: r.business_name }));
  }
}
