import type { Metadata } from "next";
import Link from "next/link";
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
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="text-muted">Que bom te ver de novo. O que vamos descobrir hoje?</p>
      </header>

      <LoginForm next={returnTo} />

      <p className="text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-brand underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
