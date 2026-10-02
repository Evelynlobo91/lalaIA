import type { Metadata } from "next";
import { PlanPicker, subscriptionOverview, subscriptionStatusLabels } from "@/modules/billing";
import { requirePartner } from "@/modules/partners";
import { FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Assinatura · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function AssinaturaPortalPage() {
  const { user } = await requirePartner("/parceiro/assinatura");
  const overview = await subscriptionOverview(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Assinatura</h1>
        <p className="text-muted">O plano define os recursos do seu negócio no LalaIA. Um plano pago passa a valer quando o pagamento é confirmado.</p>
      </div>
      {overview.status === "suspended" && <FormAlert>Sua assinatura está suspensa por falta de pagamento. Enquanto isso, vale o plano gratuito.</FormAlert>}
      {overview.status && overview.status !== "suspended" && (
        <p className="text-sm" role="status">
          Situação da assinatura: <strong>{subscriptionStatusLabels[overview.status]}</strong>.
        </p>
      )}
      <PlanPicker plans={overview.plans} />
    </div>
  );
}
