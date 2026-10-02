import type { Metadata } from "next";
import { requireRole } from "@/modules/identity";
import { ClaimReviewQueue, ReviewQueue, partnerApplicationsForReview, placeClaimsForReview } from "@/modules/partners";

export const metadata: Metadata = { title: "Cadastros de parceiros · Backoffice", robots: { index: false } };

export default async function AdminParceirosPage() {
  const admin = await requireRole("admin", "/admin/parceiros");
  const [result, claimsResult] = await Promise.all([partnerApplicationsForReview(admin), placeClaimsForReview(admin)]);
  const items = result.ok ? result.value : [];
  const claims = claimsResult.ok ? claimsResult.value : [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Cadastros de parceiros</h1>
        <p className="text-muted">
          {items.length} aguardando análise. Aprovar libera o portal do parceiro; recusar pede um motivo, que a pessoa vê para corrigir.
        </p>
      </header>
      <ReviewQueue items={items} />

      <section className="flex flex-col gap-3" aria-labelledby="vinculos">
        <h2 id="vinculos" className="text-xl font-semibold">
          Pedidos de vínculo com lugares ({claims.length})
        </h2>
        <ClaimReviewQueue items={claims} />
      </section>
    </div>
  );
}
