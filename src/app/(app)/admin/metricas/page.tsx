import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/modules/identity";
import { BackofficePlaceholder } from "../backoffice-placeholder";

export const metadata: Metadata = { title: "Métricas · Backoffice", robots: { index: false } };

export default async function AdminMetricasPage() {
  await requireRole("admin", "/admin/metricas");
  return <BackofficePlaceholder icon={BarChart3} title="Métricas" description="Aqui vão ficar os números gerais: usuários, parceiros ativos, eventos, missões concluídas e lives." />;
}
