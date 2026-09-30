"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

/**
 * Painel modal: sobe de baixo no celular e fica centralizado em telas maiores.
 * Usa <dialog> nativo, que já cuida de foco preso, Esc para fechar e fundo inerte.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // Clique no fundo (fora do conteúdo) fecha.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-3xl bg-bg p-0 text-fg backdrop:bg-black/50",
        "md:m-auto md:max-w-lg md:rounded-3xl",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-2 hover:bg-surface">
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
