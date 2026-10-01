"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { idleFormState } from "@/shared/http/form-state";
import { buttonClasses, cn, type ButtonSize } from "@/shared/ui";
import type { EntityType } from "../../../domain/favorite";
import { favToggleAction } from "../fav-toggle.action";

type Props = {
  entityType: EntityType;
  entityId: string;
  /** Estado inicial, lido no servidor. */
  initialFavorited: boolean;
  /** Sem login, o botão leva ao login e volta para esta página. */
  signedIn: boolean;
  size?: ButtonSize;
  className?: string;
};

/**
 * Favoritar/desfavoritar (RF07). Otimista: muda na hora e volta atrás se o servidor recusar.
 * Botão de alternância acessível (`aria-pressed`).
 */
export function FavoriteButton({ entityType, entityId, initialFavorited, signedIn, size = "md", className }: Props) {
  const pathname = usePathname();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [optimistic, setOptimistic] = useOptimistic(favorited);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(pathname)}`} className={buttonClasses({ variant: "secondary", size }, className)}>
        <Heart aria-hidden className="size-5" />
        Favoritar
      </Link>
    );
  }

  function toggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const form = new FormData();
      form.set("entityType", entityType);
      form.set("entityId", entityId);
      form.set("favorite", String(next));
      const state = await favToggleAction(idleFormState, form);
      startTransition(() => {
        if (state.status === "success") setFavorited(state.data.favorited);
        else if (state.status === "error") setError(state.message ?? "Não foi possível salvar. Tente de novo.");
      });
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimistic}
        className={buttonClasses({ variant: "secondary", size })}
      >
        <Heart aria-hidden className={cn("size-5", optimistic && "fill-current text-danger")} />
        {optimistic ? "Remover dos favoritos" : "Favoritar"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
