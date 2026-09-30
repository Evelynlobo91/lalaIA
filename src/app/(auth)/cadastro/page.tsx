import type { Metadata } from "next";
import { RegisterForm } from "@/modules/identity";
import { FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Criar conta" };

export default async function CadastroPage({ searchParams }: PageProps<"/cadastro">) {
  const { erro } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Criar conta</h1>
        <p className="text-muted">Salve favoritos, faça missões e receba recomendações que combinam com você.</p>
      </header>

      {erro === "link-invalido" && <FormAlert>O link de confirmação é inválido ou expirou. Cadastre-se novamente para receber um novo link.</FormAlert>}

      <RegisterForm />
    </div>
  );
}
