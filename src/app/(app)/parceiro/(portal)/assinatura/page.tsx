import type { Metadata } from "next";
import { InvoiceList, PlanPicker, SubscriptionSummary, mySubscription, subscriptionOverview } from "@/modules/billing";
import { requirePartner } from "@/modules/partners";

export const metadata: Metadata = { title: "Assinatura · Portal do parceiro" };
export const dynamic = "force-dynamic";

export default async function AssinaturaPortalPage() {
  const { user } = await requirePartner("/parceiro/assinatura");
  const [overview, mine] = await Promise.all([subscriptionOverview(user.id), mySubscription(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Assinatura</h1>
        <p className="text-muted">O plano define os recursos do seu negócio no LalaIA. Um plano pago passa a valer quando o pagamento é confirmado.</p>
      </div>

      <SubscriptionSummary view={mine} />

      <section className="flex flex-col gap-3" aria-labelledby="planos">
        <h2 id="planos" className="text-xl font-semibold">
          Planos
        </h2>
        <PlanPicker plans={overview.plans} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="faturas">
        <h2 id="faturas" className="text-xl font-semibold">
          Faturas
        </h2>
        <InvoiceList invoices={mine.invoices} />
      </section>
    </div>
  );
}
