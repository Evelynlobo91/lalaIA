import { Inbox, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Button, ButtonLink, Card, CardDescription, CardTitle, EmptyState, LiveBadge } from "@/shared/ui";
import { SheetDemo } from "./sheet-demo";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const tokens = ["bg", "surface", "surface-2", "border", "muted", "fg", "brand", "accent", "success", "warning", "danger", "live"];

// Catálogo de componentes para validar visualmente durante o desenvolvimento. Não existe em produção.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold">Design system</h1>
        <p className="text-muted">Componentes base em src/shared/ui. Alterne o tema do sistema para ver o modo escuro.</p>
        <p className="mt-2">
          <a href="/design/prototipo" className="font-medium text-brand underline">
            Protótipo da nova identidade visual (telas)
          </a>
        </p>
      </header>

      <Section title="Cores (tokens)">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {tokens.map((t) => (
            <div key={t} className="flex flex-col gap-1 text-xs">
              <span className="h-12 rounded-xl border border-border" style={{ background: `var(--${t})` }} />
              <code>{t}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Botões">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Encerrar live</Button>
          <Button loading>Salvando</Button>
          <Button disabled>Desabilitado</Button>
          <Button size="sm">Pequeno</Button>
          <Button size="lg">
            <Plus aria-hidden className="size-5" /> Grande
          </Button>
          <ButtonLink href="/" variant="secondary">
            Link como botão
          </ButtonLink>
        </div>
      </Section>

      <Section title="Selos">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutro</Badge>
          <Badge variant="brand">Show</Badge>
          <Badge variant="accent">+50 XP</Badge>
          <Badge variant="success">Aberto agora</Badge>
          <Badge variant="warning">Últimos ingressos</Badge>
          <Badge variant="danger">Encerrado</Badge>
          <LiveBadge />
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Festival de Dança</CardTitle>
              <LiveBadge />
            </div>
            <CardDescription>Centreventos Cau Hansen · começou há 20 min · 1,2 km</CardDescription>
          </Card>
          <Card className="flex flex-col gap-2">
            <CardTitle>Museu Nacional de Imigração</CardTitle>
            <CardDescription>Cultura · Centro · aberto até 17h</CardDescription>
          </Card>
        </div>
      </Section>

      <Section title="Estado vazio">
        <EmptyState icon={Inbox} title="Nenhum favorito ainda" description="Toque no coração de um lugar ou evento para salvá-lo aqui." action={<Button size="sm">Explorar</Button>} />
      </Section>

      <Section title="Painel (Sheet)">
        <SheetDemo />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
