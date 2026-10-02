"use client";

import { Heart, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/ui";
import type { LivePulseView } from "../../live-presence/live-presence.use-case";
import { REACTIONS, REACTION_KINDS, REACTION_LABELS, type ReactionKind } from "../react-to-live.use-case";
import type { FloatingReaction } from "./use-live-pulse";

const number = new Intl.NumberFormat("pt-BR");

/**
 * Emojis que sobem sobre o player (#189), como numa live de rede social. Decorativo: fica fora da leitura de tela
 * e some para quem pediu menos movimento (`prefers-reduced-motion`).
 */
export function FloatingReactions({ floats }: { floats: FloatingReaction[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl motion-reduce:hidden">
      {floats.map((f) => (
        <span key={f.id} className="live-reaction-float absolute bottom-10 text-2xl" style={{ left: `${f.left}%` }}>
          {REACTIONS[f.kind]}
        </span>
      ))}
    </div>
  );
}

type Props = {
  pulse: LivePulseView;
  liked: boolean;
  /** Visitante: os botões convidam a entrar em vez de reagir. */
  canReact: boolean;
  loginHref: string;
  notice: string | null;
  onLike: () => void;
  onReact: (kind: ReactionKind) => void;
  onVisitorTap: () => void;
};

/** Barra abaixo do player: quem está assistindo, curtir a live (com o total) e as reações rápidas. */
export function ReactionBar({ pulse, liked, canReact, loginHref, notice, onLike, onReact, onVisitorTap }: Props) {
  const tap = (action: () => void) => (canReact ? action : onVisitorTap);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm text-muted" aria-live="off">
          <Users aria-hidden className="size-4" />
          <span>
            <span className="font-semibold text-fg">{number.format(pulse.viewers)}</span> assistindo
          </span>
        </p>
        <button
          type="button"
          onClick={tap(onLike)}
          aria-pressed={liked}
          aria-label={liked ? "Descurtir a live" : "Curtir a live"}
          className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium", liked ? "border-danger text-danger" : "text-fg hover:bg-surface-2")}
        >
          <Heart aria-hidden className={cn("size-4", liked && "fill-current")} />
          <span aria-label={`${number.format(pulse.likes)} curtidas`}>{number.format(pulse.likes)}</span>
        </button>
        <div role="group" aria-label="Reações rápidas" className="flex items-center gap-1">
          {REACTION_KINDS.map((kind) => (
            <button key={kind} type="button" onClick={tap(() => onReact(kind))} aria-label={`Reagir: ${REACTION_LABELS[kind]}`} className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-surface-2 active:scale-110">
              <span aria-hidden>{REACTIONS[kind]}</span>
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}{" "}
          {!canReact && (
            <Link href={loginHref} className="font-medium text-brand underline">
              Entrar
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
