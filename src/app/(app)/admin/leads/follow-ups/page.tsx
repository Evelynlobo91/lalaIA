import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MyFollowUpsList, myFollowUps } from "@/modules/crm";
import { can, requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Meus follow-ups · Backoffice", robots: { index: false } };
// Pendências do dia: sempre os dados de agora.
export const dynamic = "force-dynamic";

export default async function AdminFollowUpsPage() {
  const user = await requireCapability("leads:read", "/admin/leads/follow-ups");
  const items = await myFollowUps(user);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Leads
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Meus follow-ups de hoje</h1>
        <p className="text-muted">Próximos passos de hoje e os atrasados, dos leads sob a sua responsabilidade.</p>
      </header>
      <MyFollowUpsList items={items} canWrite={can(user, "leads:write")} />
    </div>
  );
}
