import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { contentHref } from "@/modules/backoffice";
import { requireRole } from "@/modules/identity";
import { CreatePlaceForm } from "@/modules/places";

export const metadata: Metadata = { title: "Cadastrar estabelecimento · Backoffice", robots: { index: false } };

export default async function AdminNovoLugarPage() {
  await requireRole("admin", "/admin/conteudo/lugares/novo");

  return (
    <div className="flex flex-col gap-4">
      <Link href={contentHref("lugares")} className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <h1 className="text-2xl font-bold">Cadastrar estabelecimento</h1>
      <p className="text-muted">O lugar entra na lista pública e no mapa na hora. Depois, um parceiro pode reivindicá-lo pelo portal.</p>
      <CreatePlaceForm />
    </div>
  );
}
