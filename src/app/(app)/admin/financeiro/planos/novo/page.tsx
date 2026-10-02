import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanForm } from "@/modules/billing";
import { requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Novo plano · Backoffice", robots: { index: false } };

export default async function AdminNovoPlanoPage() {
  await requireCapability("billing:write", "/admin/financeiro/planos/novo");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/financeiro" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Financeiro
      </Link>
      <h1 className="text-2xl font-bold">Novo plano</h1>
      <PlanForm submitLabel="Criar plano" />
    </div>
  );
}
