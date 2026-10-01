"use client";

import { createContext, useContext } from "react";
import { LiveBadge } from "./badge";

/**
 * Conjunto de chaves `tipo:id` (ex.: "place:<uuid>") com transmissão ao vivo agora. Genérico: quem
 * fornece é a página (o módulo live tem um provider que atualiza sozinho); os cards de lugares e eventos
 * só consultam, sem conhecer o módulo live. Sem provider, nenhum card mostra o selo.
 */
export const LiveNowContext = createContext<ReadonlySet<string> | null>(null);

export const liveNowKey = (entityType: string, entityId: string) => `${entityType}:${entityId}`;

/** A entidade está ao vivo agora? (false sem provider). */
export function useIsLiveNow(entityType: string, entityId: string): boolean {
  return useContext(LiveNowContext)?.has(liveNowKey(entityType, entityId)) ?? false;
}

/** Selo "Ao vivo" (RF20) que aparece e some conforme o conjunto fornecido pela página. */
export function LiveNowBadge({ entityType, entityId, className }: { entityType: string; entityId: string; className?: string }) {
  return useIsLiveNow(entityType, entityId) ? <LiveBadge className={className} /> : null;
}
