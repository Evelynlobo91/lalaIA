import type { Metadata } from "next";
import { CURRENT_TERMS_VERSION } from "@/modules/identity";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  return (
    <article className="flex flex-col gap-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Termos de Uso</h1>
      <p className="text-muted">Versão {CURRENT_TERMS_VERSION} · rascunho para a POC, sujeito a revisão jurídica.</p>
      <p>O LalaIA ajuda você a descobrir lugares, eventos e experiências em Joinville. Ao criar uma conta, você concorda em:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>fornecer informações verdadeiras e manter sua senha em sigilo;</li>
        <li>usar a plataforma de forma lícita, sem fraudar missões, check-ins ou recompensas;</li>
        <li>respeitar estabelecimentos, promotores e outras pessoas usuárias.</li>
      </ul>
      <p>
        Informações sobre lugares e eventos são fornecidas por parceiros e fontes públicas e podem mudar sem aviso. Transmissões ao vivo são de
        responsabilidade de quem transmite.
      </p>
      <p>Podemos suspender contas que violem estes termos. Você pode excluir sua conta a qualquer momento.</p>
    </article>
  );
}
