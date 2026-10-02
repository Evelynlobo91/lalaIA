import type { Metadata } from "next";
import { LeadBoard, leadsFor } from "@/modules/crm";
import { can, requireCapability } from "@/modules/identity";
import { ButtonLink } from "@/shared/ui";

export const metadata: Metadata = { title: "Funil de leads · Backoffice", robots: { index: false } };
// Quadro de trabalho do time comercial: sempre os dados de agora.
export const dynamic = "force-dynamic";

export default async function AdminFunilPage() {
  const user = await requireCapability("leads:read", "/admin/leads/funil");
  const result = await leadsFor(user);
  const canWrite = can(user, "leads:write");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Funil de leads</h1>
        <p className="text-muted">Cada coluna é uma etapa. Para mover um lead, escolha a etapa no próprio card; cada mudança fica no histórico.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {canWrite && <ButtonLink href="/admin/leads/novo">Novo lead</ButtonLink>}
        <ButtonLink href="/admin/leads" variant="secondary">
          Ver em lista
        </ButtonLink>
      </div>
      <LeadBoard leads={result.ok ? result.value : []} canWrite={canWrite} />
    </div>
  );
}
