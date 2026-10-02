import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformMetricsPanel, platformMetricsView } from "@/modules/backoffice";
import { can, requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Métricas · Backoffice", robots: { index: false } };
// Os números mudam a cada visita.
export const dynamic = "force-dynamic";

export default async function AdminMetricasPage({ searchParams }: PageProps<"/admin/metricas">) {
  const admin = await requireCapability("metrics:read", "/admin/metricas");
  const result = await platformMetricsView({ isAdmin: can(admin, "metrics:read") }, await searchParams);
  if (!result.ok) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Métricas</h1>
        <p className="text-muted">Números gerais da plataforma no período, comparados com o período anterior. Só contagens, sem dados pessoais.</p>
      </header>
      <PlatformMetricsPanel view={result.value} />
    </div>
  );
}
