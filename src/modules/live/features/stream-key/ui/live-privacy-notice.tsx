import { ShieldCheck } from "lucide-react";

/** RNF16 — aviso curto de privacidade para quem transmite (a #55 completa com o aviso físico no local). */
export function LivePrivacyNotice() {
  return (
    <aside aria-label="Privacidade" className="flex gap-3 rounded-2xl border border-border bg-surface-2 p-4 text-sm">
      <ShieldCheck aria-hidden className="size-5 shrink-0" />
      <p>
        <strong>Privacidade:</strong> mostre o ambiente em plano aberto e alto, sem focar em rostos; o player começa sem áudio e
        nada é gravado. Avise as pessoas no local de que há transmissão ao vivo.
      </p>
    </aside>
  );
}
