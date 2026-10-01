import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { PortalPlaceholder } from "../portal-placeholder";

export const metadata: Metadata = { title: "Dados · Portal do parceiro" };

export default function Page() {
  return <PortalPlaceholder icon={BarChart3} title="Dados" description="Acompanhe visualizações, favoritos, cliques em “Quero ir” e acessos à Live." />;
}
