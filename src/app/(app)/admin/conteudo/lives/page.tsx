import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireCapability } from "@/modules/identity";
import { AgentStatusLine, livePrivacyOverview } from "@/modules/live";
import { Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Lives no ar · Backoffice", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLivesPage() {
  await requireCapability("content:edit", "/admin/conteudo/lives");
  const lives = await livePrivacyOverview();
  const unprotected = lives.filter((l) => l.agent.status !== "protected").length;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/conteudo" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Conteúdo
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Lives no ar</h1>
        <p className="text-muted">
          Transmissões ao vivo agora e a situação do agente que desfoca os rostos antes de o vídeo sair do local. {lives.length > 0 && `${unprotected} de ${lives.length} sem a proteção automática.`}
        </p>
      </header>
      {lives.length === 0 ? (
        <p className="text-muted">Nenhuma live no ar.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Lives no ar">
          {lives.map((l) => (
            <li key={l.streamId}>
              <Card className="flex flex-col gap-2" aria-label={`Live de ${l.title}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={l.href} prefetch={false} className="font-medium underline">
                    {l.title}
                  </Link>
                  <Badge variant={l.agent.status === "protected" ? "success" : "warning"}>{l.agent.status === "protected" ? "Rostos desfocados" : "Sem proteção automática"}</Badge>
                </div>
                <AgentStatusLine agent={l.agent} live label={l.title} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
