import type { Metadata } from "next";
import { CURRENT_TERMS_VERSION } from "@/modules/identity";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <article className="flex flex-col gap-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Política de Privacidade</h1>
      <p className="text-muted">Versão {CURRENT_TERMS_VERSION} · rascunho para a POC, sujeito a revisão jurídica.</p>
      <h2 className="text-base font-semibold">O que coletamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Nome, e-mail e senha (armazenada apenas de forma criptografada).</li>
        <li>Suas preferências, favoritos, missões e conquistas.</li>
        <li>Localização, somente quando você permitir, para mostrar o que está perto.</li>
      </ul>
      <h2 className="text-base font-semibold">Para que usamos</h2>
      <p>Para operar sua conta, recomendar experiências e medir, de forma agregada, o interesse em lugares e eventos. Não vendemos seus dados.</p>
      <h2 className="text-base font-semibold">Seus direitos (LGPD)</h2>
      <p>Você pode acessar, corrigir, exportar e excluir seus dados, e revogar consentimentos, a qualquer momento.</p>
      <h2 className="text-base font-semibold">Transmissões ao vivo</h2>
      <p>As câmeras dos parceiros devem mostrar o ambiente em plano aberto, sem áudio, com aviso no local, para evitar a identificação de frequentadores.</p>
    </article>
  );
}
