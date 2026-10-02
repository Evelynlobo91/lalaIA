import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can, requireCapability } from "@/modules/identity";
import { REPORT_REASON_LABELS, ResolveReportButtons, chatReportsForModeration } from "@/modules/live";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Denúncias do chat · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDenunciasPage() {
  const admin = await requireCapability("content:edit", "/admin/conteudo/denuncias");
  const result = await chatReportsForModeration({ id: admin.id, canModerate: can(admin, "content:edit") });
  const items = result.ok ? result.value : [];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/conteudo" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Denúncias do chat</h1>
        <p className="text-muted">Mensagens das lives que alguém denunciou. Apagar tira a mensagem do chat para todos; manter só fecha a denúncia.</p>
      </header>

      {items.length === 0 ? (
        <p className="text-muted">Nenhuma denúncia em aberto.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Denúncias em aberto">
          {items.map((r) => (
            <li key={r.messageId}>
              <Card className="flex flex-col gap-3" aria-label={`Denúncia da mensagem de ${r.authorName}`}>
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-muted">
                    {r.authorName} · {formatDateTime(r.createdAt)} ·{" "}
                    <Link href={`${r.entityType === "place" ? "/lugares" : "/eventos"}/${r.entityId}`} prefetch={false} className="underline">
                      ver a página da live
                    </Link>
                  </p>
                  <blockquote className="rounded-xl bg-surface-2 px-3 py-2 [overflow-wrap:anywhere]">{r.body}</blockquote>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {r.reports} {r.reports === 1 ? "denúncia" : "denúncias"}
                  </span>
                  {r.reasons.map((reason) => (
                    <Badge key={reason} variant="warning">
                      {REPORT_REASON_LABELS[reason]}
                    </Badge>
                  ))}
                  <span className="text-muted">· última em {formatDateTime(r.lastReportAt)}</span>
                </div>
                <ResolveReportButtons messageId={r.messageId} authorName={r.authorName} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
