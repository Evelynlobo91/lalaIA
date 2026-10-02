import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Style = { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean };

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  accent: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "bg-surface-2 text-fg hover:bg-border",
  ghost: "text-fg hover:bg-surface",
  danger: "bg-danger text-danger-fg hover:opacity-90",
};

// md e lg têm ao menos 44px de altura (alvo de toque recomendado).
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-12 px-6 text-lg",
};

export function buttonClasses({ variant = "primary", size = "md", fullWidth = false }: Style = {}, className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Style & { loading?: boolean };

export function Button({ variant, size, fullWidth, loading = false, className, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & Style;

/** Link com aparência de botão (navegação, não ação). */
export function ButtonLink({ variant, size, fullWidth, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, fullWidth }, className)} {...props} />;
}
