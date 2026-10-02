import { TicketCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/identity";
import { ValidateCodeForm, myTeamMemberships } from "@/modules/partners";

export const metadata: Metadata = { title: "Balcão · Portal do parceiro" };
export const dynamic = "force-dynamic";

// Tela do membro da equipe (#158): só valida códigos. Fica fora do portal, que é do dono.
// A equipe é conferida a cada requisição: quem foi removido cai fora no próximo acesso.
export default async function BalcaoPage() {
  const user = await requireUser("/parceiro/balcao");
  const memberships = await myTeamMemberships(user);
  if (memberships.length === 0) redirect("/parceiro");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-fg">
          <TicketCheck className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Balcão</p>
          <h1 className="truncate text-xl font-bold">{memberships.map((m) => m.businessName).join(", ")}</h1>
        </div>
      </header>
      <p className="text-muted">Digite o código que o cliente mostra no celular. Cada código vale uma vez só.</p>
      <ValidateCodeForm />
    </div>
  );
}
