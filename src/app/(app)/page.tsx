import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import { SearchBox } from "@/modules/discovery";
import { ButtonLink, Card, CardDescription, CardTitle, EmptyState, FormAlert } from "@/shared/ui";

export default async function ExplorarPage({ searchParams }: PageProps<"/">) {
  const { "bem-vindo": bemVindo } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      {bemVindo && <FormAlert variant="success">E-mail confirmado! Sua conta está ativa. Bem-vindo(a) ao LalaIA.</FormAlert>}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted">Joinville agora</p>
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">O que você quer fazer hoje?</h1>
        <p className="max-w-xl text-muted">Descubra lugares, eventos e experiências que combinam com você. Descobrir → Ver → Decidir → Viver.</p>
        <SearchBox className="mt-2 max-w-xl" />
      </section>

      <Card className="flex flex-col gap-4 border-none bg-brand text-brand-fg md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-xl">Tem 2 horas e R$70?</CardTitle>
          <CardDescription className="text-brand-fg/85">Deixa com a gente: montamos um roteiro com o que está rolando agora.</CardDescription>
        </div>
        <ButtonLink href="/surpreenda" className="bg-accent text-accent-fg hover:opacity-90" size="lg">
          <Sparkles aria-hidden className="size-5" />
          Me Surpreenda
        </ButtonLink>
      </Card>

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
    </div>
  );
}
