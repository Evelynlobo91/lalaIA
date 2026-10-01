"use client";

import { Navigation } from "lucide-react";
import { buttonClasses } from "@/shared/ui";
import type { EntityType } from "../../../domain/favorite";

type Props = {
  /** Rota no app de mapas (ex.: `directionsUrl` do lugar). */
  href: string;
  entityType: EntityType;
  entityId: string;
  className?: string;
};

/**
 * "Quero ir": abre a rota no app de mapas do celular e registra o clique em segundo plano.
 * É um link comum: o registro nunca atrasa nem bloqueia a navegação (e falhas são ignoradas).
 */
export function WantToGoButton({ href, entityType, entityId, className }: Props) {
  function record() {
    fetch("/api/favorites/want-to-go", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
      // Continua mesmo se a página for trocada pelo app de mapas.
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={record} onAuxClick={record} className={buttonClasses({ size: "lg", fullWidth: true }, className)}>
      <Navigation aria-hidden className="size-5" />
      Quero ir
      <span className="font-normal">· Como chegar</span>
    </a>
  );
}
