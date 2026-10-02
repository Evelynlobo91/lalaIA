import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/modules/identity";
import { BackofficePlaceholder } from "../backoffice-placeholder";

export const metadata: Metadata = { title: "Conteúdo · Backoffice", robots: { index: false } };

export default async function AdminConteudoPage() {
  await requireRole("admin", "/admin/conteudo");
  return <BackofficePlaceholder icon={Building2} title="Conteúdo" description="Aqui você vai listar, buscar e editar qualquer estabelecimento, evento ou missão, e cadastrar estabelecimentos direto." />;
}
