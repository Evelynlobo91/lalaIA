import type { Metadata } from "next";
import Link from "next/link";
import { leadsFor, sourceLabel, stageLabel } from "@/modules/crm";
import { can, requireCapability } from "@/modules/identity";
import { Badge, ButtonLink, Card, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Leads · Backoffice", robots: { index: false } };
// Lista de trabalho do time comercial: sempre os dados de agora.
export const dynamic = "force-dynamic";

export default async function AdminLeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const user = await requireCapability("leads:read", "/admin/leads");
  const params = await searchParams;
  const result = await leadsFor(user);
  const leads = result.ok ? result.value : [];
  const canWrite = can(user, "leads:write");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-muted">Estabelecimentos e promotores em prospecção, do primeiro contato até virar parceiro.</p>
      </header>

      {typeof params.salvo === "string" && <FormAlert variant="success">Lead salvo.</FormAlert>}

      <div className="flex flex-wrap gap-2">
        {canWrite && <ButtonLink href="/admin/leads/novo">Novo lead</ButtonLink>}
        <ButtonLink href="/admin/leads/funil" variant="secondary">
          Ver funil
        </ButtonLink>
      </div>

      {leads.length === 0 ? (
        <p className="text-muted">Nenhum lead cadastrado ainda.</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border" aria-label="Leads">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">
                    {canWrite ? (
                      <Link href={`/admin/leads/${lead.id}`} prefetch={false} className="hover:underline">
                        {lead.businessName}
                      </Link>
                    ) : (
                      lead.businessName
                    )}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {lead.contactName} · {sourceLabel(lead.source)} · Responsável: {lead.ownerName}
                  </p>
                </div>
                <Badge variant={lead.stage === "ativo" ? "success" : lead.stage === "perdido" ? "danger" : "brand"}>{stageLabel(lead.stage)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
