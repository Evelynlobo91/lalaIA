import { Target } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Missões" };

export default function MissoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Missões</h1>
      <EmptyState icon={Target} title="Missões urbanas" description="Explore Joinville, complete missões e ganhe XP e recompensas." />
    </div>
  );
}
