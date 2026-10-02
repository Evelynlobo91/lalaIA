import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  /**
   * `div` quando o card está dentro de um link: um <article> dentro de <a> faz o link perder o nome
   * acessível (o leitor de tela anunciaria só "link").
   */
  as?: "article" | "div";
};

export function Card({ as: Tag = "article", className, ...props }: CardProps) {
  return <Tag className={cn("rounded-2xl border border-border bg-surface p-4", className)} {...props} />;
}

/** Título do card. `as` ajusta o nível para manter a hierarquia da página (ex.: h2 logo abaixo do h1). */
export function CardTitle({ className, as: Tag = "h3", ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) {
  return <Tag className={cn("text-lg font-semibold leading-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
