import { ArrowLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsentsForm, DeleteAccountForm, consentsOf, requireUser } from "@/modules/identity";
import { Card } from "@/shared/ui";
import { buttonClasses } from "@/shared/ui";

export const metadata: Metadata = { title: "Privacidade e dados", robots: { index: false } };

export default async function PrivacidadePage() {
  const user = await requireUser("/perfil/privacidade");
  const consents = await consentsOf(user.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/perfil" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Perfil
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Privacidade e dados</h1>
        <p className="text-muted">Você decide o que o LalaIA usa, pode levar seus dados e pode excluir a conta quando quiser (LGPD).</p>
      </header>

      <Card as="div" role="region" aria-labelledby="o-que-coletamos" className="flex flex-col gap-2">
        <h2 id="o-que-coletamos" className="text-lg font-semibold">
          O que guardamos
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Cadastro: e-mail, nome, foto (se enviar) e os termos que você aceitou.</li>
          <li>Preferências: categorias, orçamento, distância e com quem costuma sair.</li>
          <li>O que você faz no app: favoritos, missões, XP e, se for parceiro, seus lugares, eventos e transmissões.</li>
          <li>Métricas de uso são anônimas: contamos visitas e cliques sem guardar quem fez.</li>
          <li>Sua localização nunca é gravada.</li>
        </ul>
      </Card>

      <section aria-labelledby="consentimentos" className="flex flex-col gap-3">
        <h2 id="consentimentos" className="text-lg font-semibold">
          Seus consentimentos
        </h2>
        <ConsentsForm consents={consents} />
      </section>

      <section aria-labelledby="exportar" className="flex flex-col gap-3">
        <h2 id="exportar" className="text-lg font-semibold">
          Levar seus dados
        </h2>
        <p className="text-sm text-muted">Um arquivo JSON com tudo o que o LalaIA guarda sobre você.</p>
        <a href="/api/me/export" download className={buttonClasses({ variant: "secondary" }, "self-start")}>
          <Download aria-hidden className="size-5" /> Baixar meus dados
        </a>
      </section>

      <section aria-labelledby="excluir" className="flex flex-col gap-3 rounded-2xl border border-danger/40 p-4">
        <h2 id="excluir" className="text-lg font-semibold">
          Excluir conta
        </h2>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
