import Link from "next/link";
import { LOGO_COLORS, Logo } from "@/shared/ui";
import { AuthTabs } from "./_components/auth-tabs";

// Layout das telas de conta (cadastro, login): foco no formulário, sem a navegação do app.
// No celular ocupa a tela toda; a partir do tablet vira um card centralizado.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg md:items-center md:justify-center md:px-4 md:py-10">
      <div className="flex w-full flex-1 flex-col md:max-w-md md:flex-none md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-surface md:shadow-sm">
        {/* Azul da logo nos dois temas: o topo é a "capa" da marca, não muda com o tema escuro. */}
        <header className="relative overflow-hidden px-6 pt-10 pb-12 text-white md:pt-8 md:pb-10" style={{ backgroundColor: LOGO_COLORS.navy }}>
          {/* Luzes da cidade à noite: só decoração. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_15%_20%,rgb(255_255_255/0.18),transparent_35%),radial-gradient(circle_at_85%_10%,rgb(255_50_50/0.35),transparent_30%),radial-gradient(circle_at_70%_90%,rgb(140_184_242/0.35),transparent_40%)]"
          />
          <div className="relative flex flex-col gap-4">
            <Link href="/" className="self-start">
              <Logo tone="inverse" className="h-10" />
            </Link>
            <p className="max-w-60 text-2xl leading-tight font-bold">Viva Joinville de um jeito novo.</p>
          </div>
        </header>

        <main id="conteudo" className="relative -mt-5 flex flex-1 flex-col gap-6 rounded-t-3xl bg-bg px-6 pt-6 pb-10 md:bg-surface">
          <AuthTabs />
          {children}
        </main>
      </div>
    </div>
  );
}
