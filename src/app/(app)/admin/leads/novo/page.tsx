import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadForm, leadOwnerOptions } from "@/modules/crm";
import { requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Novo lead · Backoffice", robots: { index: false } };

export default async function AdminNovoLeadPage() {
  const user = await requireCapability("leads:write", "/admin/leads/novo");
  const owners = await leadOwnerOptions();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <h1 className="text-2xl font-bold">Novo lead</h1>
      {/* Quem cadastra já vem como responsável, se fizer parte do time comercial. */}
      <LeadForm owners={owners} initial={{ ownerId: owners.some((o) => o.id === user.id) ? user.id : undefined }} submitLabel="Cadastrar lead" />
    </div>
  );
}
