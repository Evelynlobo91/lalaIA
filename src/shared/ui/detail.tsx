import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Capa das telas de detalhe (evento, lugar): faixa azul decorativa no lugar da foto do protótipo.
 * `children` são os selos sobrepostos no canto (Ao vivo, Hoje, Grátis...).
 */
export function DetailHero({ icon: Icon, children, className }: { icon: LucideIcon; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative h-44 overflow-hidden rounded-3xl bg-brand text-brand-fg shadow-sm md:h-56", className)}>
      <span
        aria-hidden
        className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_85%_20%,rgb(255_50_50/0.45),transparent_40%),radial-gradient(circle_at_15%_90%,rgb(255_255_255/0.2),transparent_45%)]"
      />
      <Icon aria-hidden strokeWidth={1.25} className="absolute -right-4 -bottom-6 size-40 opacity-20" />
      {children && <div className="relative flex flex-wrap items-center gap-2 p-4">{children}</div>}
    </div>
  );
}

/** Categoria acima do título ("CULTURA & CRIATIVIDADE"), em vermelho como no protótipo. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs font-bold uppercase tracking-wider text-accent", className)} {...props} />;
}

/** Linha de informação do detalhe: ícone em bloco, rótulo em caixa alta e conteúdo. */
export function InfoItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 px-4 py-4" aria-label={label}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand [&_svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
        <div className="flex flex-col">{children}</div>
      </div>
    </section>
  );
}
