import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { PortalPlaceholder } from "../portal-placeholder";

export const metadata: Metadata = { title: "Eventos · Portal do parceiro" };

export default function Page() {
  return <PortalPlaceholder icon={CalendarDays} title="Eventos" description="Publique shows, festas, feiras e experiências com data, horário, valor e local." />;
}
