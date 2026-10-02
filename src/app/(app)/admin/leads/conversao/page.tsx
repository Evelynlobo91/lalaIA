import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversionTable, conversionBySource } from "@/modules/crm";
import { requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Conversão por origem · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminConversaoPage({ searchParams }: PageProps<"/admin/leads/conversao">) {
  const user = await requireCapability("leads:read", "/admin/leads/conversao");
  const view = await conversionBySource(user, await searchParams);
  if (!view) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Conversão por origem</h1>
        <p className="text-muted">De onde vêm os leads que viram parceiros.</p>
      </header>
      <ConversionTable view={view} />
    </div>
  );
}
