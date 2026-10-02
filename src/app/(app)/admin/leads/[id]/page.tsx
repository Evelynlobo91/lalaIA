import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadForm, LeadHistory, MoveLeadForm, editableLead, leadHistory, leadOwnerOptions, stageLabel } from "@/modules/crm";
import { requireCapability } from "@/modules/identity";
import { Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Editar lead · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminEditarLeadPage({ params }: PageProps<"/admin/leads/[id]">) {
  const user = await requireCapability("leads:write", "/admin/leads");
  const { id } = await params;
  const [data, owners, history] = await Promise.all([editableLead(user, id), leadOwnerOptions(), leadHistory(user, id)]);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{data.businessName}</h1>
        <Badge variant={data.stage === "ativo" ? "success" : data.stage === "perdido" ? "danger" : "brand"}>{stageLabel(data.stage)}</Badge>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="etapa">
        <h2 id="etapa" className="text-xl font-semibold">
          Etapa
        </h2>
        {data.lostReason && <p className="text-sm">Motivo da perda: {data.lostReason}</p>}
        <Card className="max-w-md">
          <MoveLeadForm key={data.stage} leadId={id} businessName={data.businessName} stage={data.stage} />
          {data.stage === "ativo" && <p className="text-sm text-muted">Este lead já virou parceiro ativo.</p>}
        </Card>
        <LeadHistory changes={history} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="dados">
        <h2 id="dados" className="text-xl font-semibold">
          Dados do lead
        </h2>
        <LeadForm owners={owners} initial={data.values} submitLabel="Salvar alterações" />
      </section>
    </div>
  );
}
