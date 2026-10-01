import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { PortalPlaceholder } from "../portal-placeholder";

export const metadata: Metadata = { title: "Meus lugares · Portal do parceiro" };

export default function Page() {
  return <PortalPlaceholder icon={MapPin} title="Meus lugares" description="Reivindique seu estabelecimento entre os lugares de Joinville e mantenha endereço, horário e contatos atualizados." />;
}
