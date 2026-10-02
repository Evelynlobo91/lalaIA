import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/modules/identity";
import { BackofficePlaceholder } from "../backoffice-placeholder";

export const metadata: Metadata = { title: "Auditoria · Backoffice", robots: { index: false } };

export default async function AdminAuditoriaPage() {
  await requireRole("admin", "/admin/auditoria");
  return <BackofficePlaceholder icon={ScrollText} title="Auditoria" description="Aqui vai ficar o registro de quem fez o quê e quando no backoffice." />;
}
