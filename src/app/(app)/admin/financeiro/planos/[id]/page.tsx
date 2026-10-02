import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanForm, editablePlan } from "@/modules/billing";
import { requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Editar plano · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminEditarPlanoPage({ params }: PageProps<"/admin/financeiro/planos/[id]">) {
  const user = await requireCapability("billing:write", "/admin/financeiro");
  const { id } = await params;
  const data = await editablePlan(user, id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/financeiro" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Financeiro
      </Link>
      <h1 className="text-2xl font-bold">Plano {data.name}</h1>
      <PlanForm initial={data.values} submitLabel="Salvar alterações" />
    </div>
  );
}
