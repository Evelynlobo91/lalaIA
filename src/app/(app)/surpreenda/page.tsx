import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Me Surpreenda" };

export default function SurpreendaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Me Surpreenda</h1>
      <EmptyState
        icon={Sparkles}
        title="Seu roteiro personalizado"
        description="Diga quanto tempo e quanto quer gastar, e a gente monta um roteiro com o que está acontecendo agora."
      />
    </div>
  );
}
