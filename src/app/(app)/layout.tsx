import Link from "next/link";
import { AppNav } from "./_components/app-nav";
import { Logo } from "@/shared/ui";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="flex items-center" aria-label="LalaIA, início">
            <Logo height={28} />
          </Link>
        </div>
      </header>

      <AppNav />

      <main id="conteudo" className="flex-1 pb-24 md:pb-0 md:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
