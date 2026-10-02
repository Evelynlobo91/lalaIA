import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnerDashboardPanel, partnerDashboard, type MetricId } from "@/modules/analytics";
import { requirePartner } from "@/modules/partners";
import { partnerResources } from "@/bootstrap/partner-resources";
import { FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Dados · Portal do parceiro" };
// Os números de hoje mudam a cada visita.
export const dynamic = "force-dynamic";

const metricIds: MetricId[] = ["views", "favorites", "queroIr", "liveViews", "checkins", "conversion"];

export default async function DadosPage({ searchParams }: PageProps<"/parceiro/dados">) {
  const { user } = await requirePartner("/parceiro/dados");
  const params = await searchParams;
  const result = await partnerDashboard(user.id, params, partnerResources);
  if (result.notFound) notFound();
  const chart = metricIds.find((id) => id === params.grafico) ?? "views";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Dados</h1>
        <p className="text-muted">Visualizações, favoritos, “Quero ir”, acessos à live, check-ins e conversão dos seus lugares, eventos e missões.</p>
      </div>
      {result.invalid && <FormAlert>{result.invalid} Mostrando os últimos 30 dias.</FormAlert>}
      <PartnerDashboardPanel view={result.view} chart={chart} />
    </div>
  );
}
