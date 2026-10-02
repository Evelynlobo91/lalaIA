import { CalendarDays, ChevronRight, MapPin, Sparkles, Target, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { SearchBox } from "@/modules/discovery";
import { getCurrentUser } from "@/modules/identity";
import { RealtimeFeedSection, realtimeFeedView } from "@/modules/recommendation";
import { ButtonLink, Card, CardDescription, CardTitle, FormAlert, OsmAttribution } from "@/shared/ui";
import { DateStrip, todayLabel } from "./_components/date-strip";

// Feed "Agora perto de você": muda com a hora, a sessão e a localização.
export const dynamic = "force-dynamic";

const shortcuts: Array<{ href: string; icon: LucideIcon; title: string; description: string; cta: string }> = [
  { href: "/eventos", icon: CalendarDays, title: "O que fazer", description: "Shows, feiras, festas e exposições.", cta: "Ver eventos" },
  { href: "/lugares", icon: MapPin, title: "Onde ir", description: "Restaurantes, bares, cultura e parques.", cta: "Ver lugares" },
  { href: "/missoes", icon: Target, title: "Missões", description: "Roteiros que valem XP e conquistas.", cta: "Ver missões" },
];

export default async function InicioPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const { "bem-vindo": bemVindo, "conta-excluida": contaExcluida } = params;
  const [feed, user] = await Promise.all([realtimeFeedView(params), getCurrentUser()]);
  const now = new Date();
  const firstName = user?.displayName.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-8">
      {bemVindo && <FormAlert variant="success">E-mail confirmado! Sua conta está ativa. Bem-vindo(a) ao LalaIA.</FormAlert>}
      {contaExcluida && <FormAlert variant="success">Sua conta e seus dados foram excluídos. Obrigado por ter explorado Joinville com a gente.</FormAlert>}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{todayLabel(now)}</p>
          <h1 className="text-3xl leading-tight font-bold md:text-4xl">{firstName ? `Oi, ${firstName}. Bora viver?` : "Oi! Bora viver?"}</h1>
        </div>
        <SearchBox className="max-w-xl" />
        <DateStrip now={now} />
      </section>

      <RealtimeFeedSection view={feed.view} invalid={feed.invalid} origin={feed.origin} />

      <Card className="flex flex-col gap-4 border-none bg-brand text-brand-fg md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle as="h2" className="text-xl">Tem 2 horas e R$70?</CardTitle>
          <CardDescription className="text-brand-fg/85">Deixa com a gente: montamos um roteiro com o que está rolando agora.</CardDescription>
        </div>
        <ButtonLink href="/surpreenda?tempo=120&orcamento=70" prefetch={false} variant="accent" size="lg">
          <Sparkles aria-hidden className="size-5" />
          Me Surpreenda
        </ButtonLink>
      </Card>

      <section aria-labelledby="atalhos" className="flex flex-col gap-3">
        <h2 id="atalhos" className="text-xl font-bold">
          Explore Joinville
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {shortcuts.map(({ href, icon: Icon, title, description, cta }) => (
            <li key={href}>
              <Link href={href} className="block h-full rounded-2xl transition hover:-translate-y-0.5">
                <Card as="div" className="flex h-full items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{title}</span>
                    <span className="text-sm text-muted">{description}</span>
                    <span className="sr-only">{cta}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <OsmAttribution className="text-center" />
    </div>
  );
}
