import { ChevronRight } from "lucide-react";
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
  "/parceiro/dados": "Veja quem se interessou pelo que você publica.",
};

export default async function InicioPortalPage() {
  const { user } = await requirePartner("/parceiro/inicio");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Olá, {user.displayName}!</h1>
      <p className="text-muted">Por onde você quer começar?</p>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Seções do portal">
        {portalSections
          .filter((s) => s.href !== "/parceiro/inicio")
          .map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
                <Card as="div" className="flex items-center gap-3">
                  <Icon aria-hidden className="size-6 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>{descriptions[href]}</CardDescription>
                  </div>
                  <ChevronRight aria-hidden className="size-5 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
