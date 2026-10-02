import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm, getCurrentUser } from "@/modules/identity";
import { safeRedirectPath } from "@/shared/http/safe-redirect";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { next } = await searchParams;
  const returnTo = safeRedirectPath(typeof next === "string" ? next : undefined);

  // Já logado: não mostra o formulário de novo.
  if (await getCurrentUser()) redirect(returnTo);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Boas-vindas!</h1>
        <p className="text-muted">Entre para descobrir eventos, lugares e missões perto de você.</p>
      </header>

      <LoginForm next={returnTo} />
    </div>
  );
}
