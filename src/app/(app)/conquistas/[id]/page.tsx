import { Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sharedAchievementOf } from "@/modules/progression";
import { formatDateTime } from "@/shared/time/joinville-time";
import { ButtonLink, Card } from "@/shared/ui";

export async function generateMetadata({ params }: PageProps<"/conquistas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const shared = await sharedAchievementOf(id);
  if (!shared) return { title: "Conquista não encontrada", robots: { index: false } };
  const who = shared.firstName ?? "Alguém";
  const description = `${who} desbloqueou "${shared.title}" explorando Joinville. Desbloqueie essa experiência no LalaIA.`;
  return {
    title: `${shared.title} · Conquista`,
    description,
    // Página pessoal compartilhada: fora dos buscadores, mas com card bonito nas redes.
    robots: { index: false },
    openGraph: { type: "website", locale: "pt_BR", siteName: "LalaIA", title: `${who} desbloqueou "${shared.title}"`, description, url: `/conquistas/${id}` },
    twitter: { card: "summary_large_image", title: `${who} desbloqueou "${shared.title}"`, description },
  };
}

export default async function ConquistaCompartilhadaPage({ params }: PageProps<"/conquistas/[id]">) {
  const { id } = await params;
  const shared = await sharedAchievementOf(id);
  if (!shared) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-6 text-center">
      <Card as="div" className="flex w-full flex-col items-center gap-3 border-brand py-8">
        <Trophy aria-hidden className="size-14 text-brand" />
        <p className="text-sm font-medium text-muted">{shared.firstName ?? "Alguém"} desbloqueou</p>
        <h1 className="text-3xl font-bold leading-tight">{shared.title}</h1>
        <p className="text-muted">{shared.description}</p>
        <p className="text-xs text-muted">em {formatDateTime(shared.unlockedAt)}</p>
      </Card>
      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-semibold">Desbloqueie essa experiência no LalaIA</p>
        <ButtonLink href={shared.cta.href} size="lg">
          <Sparkles aria-hidden className="size-5" /> {shared.cta.label}
        </ButtonLink>
        <ButtonLink href="/cadastro" variant="ghost" size="sm">
          Criar conta grátis
        </ButtonLink>
      </div>
    </div>
  );
}
