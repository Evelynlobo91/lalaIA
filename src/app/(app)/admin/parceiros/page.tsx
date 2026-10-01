import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/modules/identity";
import { ReviewQueue, partnerApplicationsForReview } from "@/modules/partners";

export const metadata: Metadata = { title: "Cadastros de parceiros", robots: { index: false } };

export default async function AdminParceirosPage() {
  const admin = await requireRole("admin", "/admin/parceiros");
  const result = await partnerApplicationsForReview(admin);
  const items = result.ok ? result.value : [];

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
    </div>
  );
}
