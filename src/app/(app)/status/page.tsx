import type { Metadata } from "next";
import { HealthStatusView, healthReport } from "@/modules/platform";

export const metadata: Metadata = { title: "Status", description: "Situação atual dos serviços do LalaIA.", robots: { index: false } };
// Sempre a verificação do momento.
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const report = await healthReport();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Status do LalaIA</h1>
      <HealthStatusView report={report} />
    </div>
  );
}
