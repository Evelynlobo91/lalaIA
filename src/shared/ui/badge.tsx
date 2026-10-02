import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "live";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-fg",
  brand: "bg-brand text-brand-fg",
  accent: "bg-accent text-accent-fg",
  success: "bg-success text-success-fg",
  warning: "bg-warning text-warning-fg",
  danger: "bg-danger text-danger-fg",
  live: "bg-live text-live-fg",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant };

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", variants[variant], className)}
      {...props}
    />
  );
}

/** Selo de transmissão ao vivo (RF20): ponto pulsante + texto, legível sem depender só da cor. */
export function LiveBadge({ className, children = "Ao vivo", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <Badge variant="live" className={cn("uppercase tracking-wide", className)} {...props}>
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {children}
    </Badge>
  );
}
