import Link from "next/link";
import { Logo } from "@/shared/ui";

// Layout das telas de conta (cadastro, login): foco no formulário, sem a navegação do app.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-4 py-8 md:justify-center">
      <header className="mb-6">
        <Link href="/" className="flex items-center">
          <Logo className="h-12" />
        </Link>
      </header>
      <main className="w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-sm md:p-8">{children}</main>
    </div>
  );
}
