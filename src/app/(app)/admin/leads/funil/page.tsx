import type { Metadata } from "next";
import { LeadBoard, LeadFilters, leadFilterFrom, leadFilterQuery, leadOwnerOptions, leadsFor } from "@/modules/crm";
import { can, requireCapability } from "@/modules/identity";
import { ButtonLink } from "@/shared/ui";

export const metadata: Metadata = { title: "Funil de leads · Backoffice", robots: { index: false } };
// Quadro de trabalho do time comercial: sempre os dados de agora.
export const dynamic = "force-dynamic";

export default async function AdminFunilPage({ searchParams }: PageProps<"/admin/leads/funil">) {
  const user = await requireCapability("leads:read", "/admin/leads/funil");
  const params = await searchParams;
  const filter = leadFilterFrom(params);
  const [result, owners] = await Promise.all([leadsFor(user, params), leadOwnerOptions()]);
  const canWrite = can(user, "leads:write");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Funil de leads</h1>
        <p className="text-muted">Cada coluna é uma etapa. Para mover um lead, escolha a etapa no próprio card; cada mudança fica no histórico.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {canWrite && <ButtonLink href="/admin/leads/novo">Novo lead</ButtonLink>}
        <ButtonLink href={`/admin/leads${leadFilterQuery(filter)}`} variant="secondary">
          Ver em lista
        </ButtonLink>
      </div>
      <LeadFilters action="/admin/leads/funil" filter={filter} owners={owners} />
      <LeadBoard leads={result.ok ? result.value : []} canWrite={canWrite} />
    </div>
  );
}
