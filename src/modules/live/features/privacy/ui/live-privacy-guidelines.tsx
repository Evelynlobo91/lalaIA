import { CheckCircle2, ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Card, CardTitle } from "@/shared/ui";
import { PrivacyChecklist } from "./privacy-checklist";

/**
 * Portal: diretrizes de privacidade da live (RNF16/RNF17). Sem aceite → checklist obrigatório; com aceite →
 * a data em que foi registrado. O guia de câmera fica sempre visível.
 */
export function LivePrivacyGuidelines({ acceptedAt }: { acceptedAt: Date | null }) {
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle className="flex items-center gap-2">
        {acceptedAt ? <CheckCircle2 aria-hidden className="size-5 text-success" /> : <ShieldAlert aria-hidden className="size-5 text-warning" />}
        Diretrizes de privacidade
      </CardTitle>
      {acceptedAt ? (
        <p className="text-sm" role="status">
          Diretrizes aceitas em <strong>{formatDateTime(acceptedAt)}</strong>. Lembre-se delas a cada transmissão.
        </p>
      ) : (
        <PrivacyChecklist />
      )}
      <CameraGuide />
    </Card>
  );
}

/** Guia de posicionamento de câmera e regras curtas (plano aberto e alto, sem áudio, aviso físico, LGPD). */
export function CameraGuide() {
  return (
    <section aria-labelledby="guia-camera" className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4 text-sm">
      <h3 id="guia-camera" className="font-semibold">
        Como posicionar a câmera
      </h3>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Plano aberto e alto:</strong> câmera acima da altura das cabeças (ex.: no alto de uma parede ou no canto do
          teto), mostrando o ambiente inteiro: palco, pista, decoração, movimento.
        </li>
        <li>
          <strong>Sem close:</strong> nada de rostos, mesas de perto, telas de celular ou documentos. Fora de quadro sempre:
          banheiros, caixa, cozinha e áreas de funcionários.
        </li>
        <li>
          <strong>Sem áudio:</strong> desligue o microfone no OBS/Larix. Conversas no local não podem vazar; o player do público
          já começa mudo.
        </li>
        <li>
          <strong>Aviso físico no local:</strong> cartaz visível na entrada e perto da câmera, por exemplo: &quot;Este ambiente é
          transmitido ao vivo (sem áudio e sem gravação) no LalaIA&quot;.
        </li>
        <li>
          <strong>LGPD:</strong> a imagem de uma pessoa é um dado pessoal. Se alguém pedir para não aparecer, ajuste o
          enquadramento ou pause a live na hora. A plataforma não grava a transmissão.
        </li>
      </ul>
    </section>
  );
}
