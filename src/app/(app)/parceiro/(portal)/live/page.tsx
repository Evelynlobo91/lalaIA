import { Radio } from "lucide-react";
import type { Metadata } from "next";
import { PortalPlaceholder } from "../portal-placeholder";

export const metadata: Metadata = { title: "Live · Portal do parceiro" };

export default function Page() {
  return <PortalPlaceholder icon={Radio} title="Live" description="Transmita o ambiente ao vivo para quem está decidindo aonde ir agora." />;
}
