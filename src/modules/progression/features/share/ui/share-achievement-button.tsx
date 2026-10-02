"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui";
import { shareText } from "../share.use-case";

/**
 * Compartilhar uma conquista (#70): no celular abre o menu nativo (Web Share API: Instagram, WhatsApp...);
 * sem ele, copia o link. O link abre a página pública com a imagem gerada da conquista.
 */
export function ShareAchievementButton({ unlockId, title }: { unlockId: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/conquistas/${unlockId}`;
    const data = { title: `Conquista no LalaIA: ${title}`, text: shareText(title), url };
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return; // a pessoa cancelou
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copie o link da sua conquista:", url);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={share} aria-label={`Compartilhar a conquista ${title}`} className="self-start">
      {copied ? <Check aria-hidden className="size-4" /> : <Share2 aria-hidden className="size-4" />}
      {copied ? "Link copiado" : "Compartilhar"}
    </Button>
  );
}
