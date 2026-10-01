import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/modules/identity";
import { ClaimReviewQueue, ReviewQueue, partnerApplicationsForReview, placeClaimsForReview } from "@/modules/partners";

export const metadata: Metadata = { title: "Cadastros de parceiros", robots: { index: false } };

export default async function AdminParceirosPage() {
  const admin = await requireRole("admin", "/admin/parceiros");
  const [result, claimsResult] = await Promise.all([partnerApplicationsForReview(admin), placeClaimsForReview(admin)]);
  const items = result.ok ? result.value : [];
  const claims = claimsResult.ok ? claimsResult.value : [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Moderação
      </Link>
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Cadastros de parceiros</h1>
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
