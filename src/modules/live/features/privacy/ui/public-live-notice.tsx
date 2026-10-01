import { ShieldCheck } from "lucide-react";

/** Aviso curto ao público, perto do player (RNF16): o que é e o que não é transmitido. */
export function PublicLiveNotice() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted">
      <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Imagem do ambiente em plano aberto, sem áudio e sem gravação. O local avisa que há transmissão; quem não quiser aparecer
        pode pedir à equipe.
      </span>
    </p>
  );
}
