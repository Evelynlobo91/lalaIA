import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadForm, editableLead, leadOwnerOptions } from "@/modules/crm";
import { requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Editar lead · Backoffice", robots: { index: false } };

export default async function AdminEditarLeadPage({ params }: PageProps<"/admin/leads/[id]">) {
  const user = await requireCapability("leads:write", "/admin/leads");
  const { id } = await params;
  const [data, owners] = await Promise.all([editableLead(user, id), leadOwnerOptions()]);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <h1 className="text-2xl font-bold">{data.businessName}</h1>
      <LeadForm owners={owners} initial={data.values} submitLabel="Salvar alterações" />
    </div>
  );
}
