import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can, requireCapability } from "@/modules/identity";
import { CTA_TYPE_LABELS, ModerateCtaButton, ctasForModeration } from "@/modules/live";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Chamadas nas lives · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminChamadasPage() {
  const admin = await requireCapability("content:edit", "/admin/conteudo/chamadas");
  const result = await ctasForModeration({ id: admin.id, canModerate: can(admin, "content:edit") });
  const items = result.ok ? result.value : [];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/conteudo" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Chamadas nas lives</h1>
        <p className="text-muted">Cartões que os parceiros programam sobre as transmissões. Uma chamada desativada não aparece para ninguém, e só a moderação reativa.</p>
      </header>

      {items.length === 0 ? (
        <p className="text-muted">Nenhuma chamada programada.</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border" aria-label="Chamadas nas lives">
            {items.map((cta) => (
              <li key={cta.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" aria-label={`Chamada ${cta.title}`}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{cta.title}</p>
                  {cta.body && <p className="text-sm">{cta.body}</p>}
                  <p className="break-all text-sm text-muted">
                    Botão “{cta.buttonLabel}” → {cta.href}
                  </p>
                  <p className="text-sm text-muted">
                    {CTA_TYPE_LABELS[cta.type]} · criada em {formatDateTime(cta.createdAt)} ·{" "}
                    <Link href={`${cta.entityType === "place" ? "/lugares" : "/eventos"}/${cta.entityId}`} prefetch={false} className="underline">
                      ver a página da live
                    </Link>
                  </p>
                </div>
                <Badge variant={cta.disabledAt ? "danger" : "success"}>{cta.disabledAt ? "Desativada" : "Ativa"}</Badge>
                <ModerateCtaButton ctaId={cta.id} title={cta.title} disabled={cta.disabledAt !== null} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
