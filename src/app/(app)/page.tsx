import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { SearchBox } from "@/modules/discovery";
import { RealtimeFeedSection, realtimeFeedView } from "@/modules/recommendation";
import { ButtonLink, Card, CardDescription, CardTitle, EmptyState, FormAlert, OsmAttribution } from "@/shared/ui";

// Feed "Agora perto de você": muda com a hora, a sessão e a localização.
export const dynamic = "force-dynamic";

export default async function ExplorarPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const { "bem-vindo": bemVindo, "conta-excluida": contaExcluida } = params;

  return (
    <div className="flex flex-col gap-8">
      {bemVindo && <FormAlert variant="success">E-mail confirmado! Sua conta está ativa. Bem-vindo(a) ao LalaIA.</FormAlert>}
      {contaExcluida && <FormAlert variant="success">Sua conta e seus dados foram excluídos. Obrigado por ter explorado Joinville com a gente.</FormAlert>}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted">Joinville agora</p>
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">O que você quer fazer hoje?</h1>
        <p className="max-w-xl text-muted">Descubra lugares, eventos e experiências que combinam com você. Descobrir → Ver → Decidir → Viver.</p>
        <SearchBox className="mt-2 max-w-xl" />
      </section>

      <Card className="flex flex-col gap-4 border-none bg-brand text-brand-fg md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle as="h2" className="text-xl">Tem 2 horas e R$70?</CardTitle>
          <CardDescription className="text-brand-fg/85">Deixa com a gente: montamos um roteiro com o que está rolando agora.</CardDescription>
        </div>
        <ButtonLink href="/surpreenda?tempo=120&orcamento=70" prefetch={false} className="bg-accent text-accent-fg hover:opacity-90" size="lg">
          <Sparkles aria-hidden className="size-5" />
          Me Surpreenda
        </ButtonLink>
      </Card>

      {/* O feed (recomendação) é a parte lenta: chega por streaming, sem segurar o topo da página (#79). */}
      <Suspense fallback={<FeedSkeleton />}>
        <Feed params={params} />
      </Suspense>

      <section className="grid gap-4 md:grid-cols-2">
        <EmptyState
          icon={CalendarDays}
          title="O que fazer"
          description="Shows, feiras, festas e exposições acontecendo ou chegando em Joinville."
          action={
            <ButtonLink href="/eventos" variant="secondary" size="sm">
              Ver eventos
            </ButtonLink>
          }
        />
        <EmptyState
          icon={MapPin}
          title="Onde ir"
          description="Restaurantes, bares, cultura, parques e passeios de Joinville."
          action={
            <ButtonLink href="/lugares" variant="secondary" size="sm">
              Ver lugares
            </ButtonLink>
          }
        />
      </section>
      <OsmAttribution className="text-center" />
    </div>
  );
}

async function Feed({ params }: { params: Record<string, string | string[] | undefined> }) {
  const feed = await realtimeFeedView(params);
  return <RealtimeFeedSection view={feed.view} invalid={feed.invalid} origin={feed.origin} />;
}

function FeedSkeleton() {
  return (
    <section aria-busy="true" aria-label="Carregando o que está rolando agora" className="flex flex-col gap-3">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
