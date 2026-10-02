import { ChevronRight, RadioTower } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { portalSections, requirePartner } from "@/modules/partners";
import { Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Início · Portal do parceiro" };

const descriptions: Record<string, string> = {
  "/parceiro/lugares": "Assuma a página do seu estabelecimento e mantenha os dados em dia.",
  "/parceiro/eventos": "Publique o que está acontecendo e o que vem por aí.",
  "/parceiro/live": "Mostre o ambiente ao vivo para quem está decidindo.",
  "/parceiro/missoes": "Crie missões e recompensas para atrair exploradores.",
  "/parceiro/ofertas": "Ofereça descontos e valide os códigos no balcão.",
  "/parceiro/dados": "Veja quem se interessou pelo que você publica.",
};

export default async function InicioPortalPage() {
  const { user } = await requirePartner("/parceiro/inicio");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Olá, {user.displayName}!</h1>
        <p className="text-muted">Por onde você quer começar?</p>
      </header>

      {/* Chamada em vermelho do protótipo ("Apareça para mais pessoas"). */}
      <Link
        href="/parceiro/live"
        className="flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-fg shadow-sm transition hover:-translate-y-0.5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <RadioTower aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">Apareça para mais pessoas</span>
          <span className="text-sm opacity-90">Abra uma live e mostre o ambiente agora.</span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0" />
      </Link>

      <section aria-labelledby="criar-agora" className="flex flex-col gap-3">
        <h2 id="criar-agora" className="text-lg font-bold">
          Criar agora
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Seções do portal">
          {portalSections
            .filter((s) => s.href !== "/parceiro/inicio")
            .map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="block h-full rounded-2xl transition hover:-translate-y-0.5">
                  <Card as="div" className="flex h-full flex-col gap-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-brand">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>{descriptions[href]}</CardDescription>
                  </Card>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
