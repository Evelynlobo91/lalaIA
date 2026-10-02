import { User } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Perfil" };

export default function PerfilPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Perfil</h1>
      <EmptyState icon={User} title="Seu perfil de explorador" description="Entre para salvar favoritos, acompanhar missões e ver tudo o que você já descobriu." />
    </div>
  );
}
