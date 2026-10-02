import { KanbanSquare } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/modules/identity";
import { BackofficePlaceholder } from "../backoffice-placeholder";

export const metadata: Metadata = { title: "Leads · Backoffice", robots: { index: false } };

export default async function AdminLeadsPage() {
  await requireRole("admin", "/admin/leads");
  return <BackofficePlaceholder icon={KanbanSquare} title="Leads" description="Aqui vai ficar o funil de captação: lead, contato, proposta e parceiro ativo." />;
}
