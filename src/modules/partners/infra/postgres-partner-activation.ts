import type { Sql } from "@/shared/db/sql";
import type { ActivationOutcome, PartnerActivation, PartnerActivationStore } from "../features/activate-partner/activate-partner";

/**
 * Ativação de parceiro pelo sistema (#150): sem `asUser`, porque quem aceita o convite não é do time e a
 * RLS (corretamente) não deixa ninguém se aprovar. A autorização é o convite validado por quem chama.
 */
export class PostgresPartnerActivation implements PartnerActivationStore {
  constructor(private readonly sql: Sql) {}

  async activate(a: PartnerActivation): Promise<ActivationOutcome> {
    return this.sql.begin(async (tx) => {
      const [existing] = await tx<{ id: string; status: string }[]>`select id, status from partners.partners where owner_id = ${a.userId} for update`;
      if (existing?.status === "suspended") return { status: "suspended" } as const;

      let partnerId: string;
      let status: "activated" | "already_active";
      if (existing?.status === "approved") {
        partnerId = existing.id;
        status = "already_active";
      } else {
        // Sem cadastro, pendente ou recusado: passa a valer o que o time combinou com o lead.
        const [row] = await tx<{ id: string }[]>`
          insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_by, reviewed_at)
          values (${a.userId}, ${a.kind}, ${a.businessName}, ${a.phone}, ${a.description}, 'approved', ${a.activatedBy}, now())
          on conflict (owner_id) do update set
            kind = excluded.kind, business_name = excluded.business_name, phone = excluded.phone, description = excluded.description,
            status = 'approved', rejection_reason = null, reviewed_by = excluded.reviewed_by, reviewed_at = now()
          returning id`;
        partnerId = row.id;
        status = "activated";
      }

      let claimId: string | null = null;
      if (a.placeId) {
        // Um lugar tem no máximo um responsável aprovado: se já for de outro parceiro, fica sem vínculo.
        const [taken] = await tx`select 1 from partners.place_claims where place_id = ${a.placeId} and status = 'approved' and partner_id <> ${partnerId}`;
        if (!taken) {
          const [claim] = await tx<{ id: string }[]>`
            insert into partners.place_claims (partner_id, place_id, status, reviewed_by, reviewed_at)
            values (${partnerId}, ${a.placeId}, 'approved', ${a.activatedBy}, now())
            on conflict (partner_id, place_id) do update set status = 'approved', rejection_reason = null, reviewed_by = excluded.reviewed_by, reviewed_at = now()
            returning id`;
          claimId = claim.id;
        }
      }
      return { status, partnerId, claimId };
    }) as Promise<ActivationOutcome>;
  }
}
