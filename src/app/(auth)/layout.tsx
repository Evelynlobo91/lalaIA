import Link from "next/link";

// Layout das telas de conta (cadastro, login): foco no formulário, sem a navegação do app.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-4 py-8 md:justify-center">
      <Link href="/" className="mb-6 flex items-center gap-2 text-2xl font-bold text-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático pequeno */}
        <img src="/icon.svg" alt="" className="size-9" />
        LalaIA
      </Link>
      <main className="w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-sm md:p-8">{children}</main>
    </div>
  );
}
