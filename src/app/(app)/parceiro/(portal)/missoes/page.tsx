import { Target } from "lucide-react";
import type { Metadata } from "next";
import { PortalPlaceholder } from "../portal-placeholder";

export const metadata: Metadata = { title: "Missões · Portal do parceiro" };

export default function Page() {
  return <PortalPlaceholder icon={Target} title="Missões" description="Crie missões e recompensas para trazer exploradores até você." />;
}
