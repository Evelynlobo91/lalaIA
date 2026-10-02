import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { requireCapability } from "@/modules/identity";
import { BackofficePlaceholder } from "../backoffice-placeholder";

export const metadata: Metadata = { title: "Financeiro · Backoffice", robots: { index: false } };

export default async function AdminFinanceiroPage() {
  await requireCapability("billing:read", "/admin/financeiro");
  return <BackofficePlaceholder icon={Wallet} title="Financeiro" description="Aqui vão ficar os planos, as assinaturas, as faturas e os inadimplentes." />;
}
