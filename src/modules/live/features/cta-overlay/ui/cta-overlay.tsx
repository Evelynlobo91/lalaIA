"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/shared/ui";
import type { ActiveCtaView } from "../../active-cta/active-cta.use-case";

const CLOSED_KEY = "lalaia:cta:fechadas";

function closedIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(CLOSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberClosed(id: string) {
  try {
    sessionStorage.setItem(CLOSED_KEY, JSON.stringify([...new Set([...closedIds(), id])].slice(-50)));
  } catch {
    // Sem sessionStorage (modo privado/bloqueado): vale só enquanto a página estiver aberta.
  }
}

type Props = {
  cta: ActiveCtaView | null;
  /** Lugar/evento transmitido: o "Quero ir" é registrado para ele. */
  entityType: "place" | "event";
  entityId: string;
};

/**
 * #180 — Chamada do anfitrião sobre o player. No celular fica logo abaixo do vídeo; em telas maiores, no canto
 * de cima (não cobre o centro nem os controles). Pode ser fechada e não volta na mesma sessão. Some sozinha no
 * fim da janela, mesmo que a próxima consulta de status ainda não tenha chegado.
 */
export function CtaOverlay({ cta, entityType, entityId }: Props) {
  // null = ainda não leu o sessionStorage (primeiro render igual ao do servidor: nada aparece antes disso).
  const [closed, setClosed] = useState<string[] | null>(null);
  const [expired, setExpired] = useState<string | null>(null);

  useEffect(() => {
    const first = setTimeout(() => setClosed(closedIds()), 0);
    return () => clearTimeout(first);
  }, []);

  const key = cta ? `${cta.id}@${cta.until}` : null;
  useEffect(() => {
    if (!cta || !key) return;
    const left = new Date(cta.until).getTime() - Date.now();
    const timer = setTimeout(() => setExpired(key), Math.max(0, Math.min(left, 2_000_000_000)));
    return () => clearTimeout(timer);
  }, [cta, key]);

  if (!cta || closed === null || closed.includes(cta.id) || expired === key) return null;

  const close = () => {
    rememberClosed(cta.id);
    setClosed((ids) => [...(ids ?? []), cta.id]);
  };

  const recordWantToGo = () => {
    if (cta.type !== "quero-ir") return;
    fetch("/api/favorites/want-to-go", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
      keepalive: true,
    }).catch(() => undefined);
  };

  const buttonClass = buttonClasses({ size: "sm" }, "self-start");

  return (
    <aside
      aria-label="Chamada do anfitrião"
      aria-live="polite"
      className="mt-2 flex items-start gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:absolute sm:right-3 sm:top-3 sm:mt-0 sm:max-w-xs sm:bg-surface/95 sm:shadow-lg sm:backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{cta.title}</p>
          {cta.body && <p className="text-sm text-muted">{cta.body}</p>}
        </div>
        {cta.external ? (
          <a href={cta.href} target="_blank" rel="noopener noreferrer" onClick={recordWantToGo} onAuxClick={recordWantToGo} className={buttonClass}>
            {cta.buttonLabel}
            <ExternalLink aria-hidden className="size-4" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        ) : (
          <Link href={cta.href} className={buttonClass}>
            {cta.buttonLabel}
          </Link>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Fechar a chamada" className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg">
        <X aria-hidden className="size-5" />
      </button>
    </aside>
  );
}
