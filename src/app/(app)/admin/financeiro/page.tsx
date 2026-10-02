import type { Metadata } from "next";
import { PlanList, plansFor } from "@/modules/billing";
import { can, requireCapability } from "@/modules/identity";
import { ButtonLink, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Financeiro · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminFinanceiroPage({ searchParams }: PageProps<"/admin/financeiro">) {
  const user = await requireCapability("billing:read", "/admin/financeiro");
  const params = await searchParams;
  const result = await plansFor(user);
  const canWrite = can(user, "billing:write");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-muted">Planos dos parceiros e os recursos que cada um libera.</p>
      </header>

      {typeof params.salvo === "string" && <FormAlert variant="success">Plano salvo.</FormAlert>}

      <section className="flex flex-col gap-3" aria-labelledby="planos">
        <h2 id="planos" className="text-xl font-semibold">
          Planos
        </h2>
        {canWrite && (
          <ButtonLink href="/admin/financeiro/planos/novo" className="self-start">
            Novo plano
          </ButtonLink>
        )}
        <PlanList plans={result.ok ? result.value : []} canWrite={canWrite} />
      </section>
    </div>
  );
}
