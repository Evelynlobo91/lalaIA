import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { OfferTarget } from "../domain/offer";
import type { Sponsorship, SponsorshipRepository } from "../features/visibility/visibility.use-cases";

type Row = { id: string; partner_id: string; target_type: OfferTarget["type"]; target_id: string; starts_at: Date; ends_at: Date; status: "active" | "ended" };
const COLUMNS = "id, partner_id, target_type, target_id, starts_at, ends_at, status";
const toSponsorship = (r: Row): Sponsorship => ({ id: r.id, partnerId: r.partner_id, target: { type: r.target_type, id: r.target_id }, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status });

const UNIQUE_VIOLATION = "23505";

export class PostgresSponsorshipRepository implements SponsorshipRepository {
  constructor(private readonly sql: Sql) {}

  async create(actorId: string, partnerId: string, target: OfferTarget, startsAt: Date, endsAt: Date): Promise<Sponsorship | null> {
    try {
      return await asUser(
        actorId,
        async (tx) => {
          // Destaque vencido ainda marcado como ativo deixa de ocupar o alvo (o índice único é por status).
          await tx`update partners.sponsorships set status = 'ended', ended_at = now()
                   where target_type = ${target.type} and target_id = ${target.id} and status = 'active' and ends_at <= now() and partner_id = ${partnerId}`;
          const [row] = await tx.unsafe<Row[]>(
            `insert into partners.sponsorships (partner_id, target_type, target_id, starts_at, ends_at) values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
            [partnerId, target.type, target.id, startsAt, endsAt],
          );
          return toSponsorship(row);
        },
        this.sql,
      );
    } catch (error) {
      // Corrida ou alvo já destacado por outro parceiro (um destaque ativo por alvo).
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  async listByPartner(actorId: string, partnerId: string): Promise<Sponsorship[]> {
    const rows = await asUser(actorId, (tx) => tx.unsafe<Row[]>(`select ${COLUMNS} from partners.sponsorships where partner_id = $1 order by created_at desc limit 100`, [partnerId]), this.sql);
    return rows.map(toSponsorship);
  }

  async end(actorId: string, partnerId: string, sponsorshipId: string): Promise<Sponsorship | null> {
    const [row] = await asUser(
      actorId,
      (tx) => tx.unsafe<Row[]>(`update partners.sponsorships set status = 'ended', ended_at = now() where id = $1 and partner_id = $2 and status = 'active' returning ${COLUMNS}`, [sponsorshipId, partnerId]),
      this.sql,
    );
    return row ? toSponsorship(row) : null;
  }

  // Sistema (sem asUser): leitura pública do que está em destaque agora. Parceiro suspenso ou não aprovado fica de fora.
  async activeKeys(now: Date): Promise<string[]> {
    const rows = await this.sql<{ key: string }[]>`
      select s.target_type || ':' || s.target_id as key
      from partners.sponsorships s join partners.partners p on p.id = s.partner_id
      where s.status = 'active' and s.starts_at <= ${now} and s.ends_at > ${now} and p.status = 'approved'`;
    return rows.map((r) => r.key);
  }

  async endAllOf(ownerId: string): Promise<number> {
    const rows = await this.sql`
      update partners.sponsorships s set status = 'ended', ended_at = now()
      from partners.partners p
      where p.id = s.partner_id and p.owner_id = ${ownerId} and s.status = 'active'
      returning s.id`;
    return rows.length;
  }
}
