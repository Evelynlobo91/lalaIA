import { Map } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/shared/ui";

export const metadata: Metadata = { title: "Mapa" };

export default function MapaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Mapa</h1>
      <EmptyState icon={Map} title="O mapa de Joinville está chegando" description="Lugares, eventos acontecendo agora e transmissões ao vivo, tudo no mapa." />
    </div>
  );
}
