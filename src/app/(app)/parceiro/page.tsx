import { Store } from "lucide-react";
import type { Metadata } from "next";
import { hasRole, requireUser } from "@/modules/identity";
import { EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Portal do parceiro" };

export default async function ParceiroPage() {
  const user = await requireUser("/parceiro");

  if (!hasRole(user, "partner")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold md:text-3xl">Portal do parceiro</h1>
        <EmptyState
          icon={Store}
          title="Área exclusiva para parceiros"
          description="Estabelecimentos e promotores de Joinville publicam eventos, lives, missões e recompensas por aqui. O cadastro de parceiros abre em breve."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Portal do parceiro</h1>
      <EmptyState icon={Store} title={`Olá, ${user.displayName}!`} description="Aqui você vai gerenciar seus lugares, eventos, transmissões ao vivo e missões." />
    </div>
  );
}
