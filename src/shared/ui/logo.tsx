import type { SVGAttributes } from "react";
import { cn } from "./cn";
import { LOGO_COLORS, LOGO_PIN_PATH, LOGO_VIEWBOX, LOGO_WORDMARK_PATH } from "./logo-paths";

type LogoProps = Omit<SVGAttributes<SVGSVGElement>, "children"> & {
  /** "default": wordmark azul (branco no tema escuro). "inverse": wordmark branco, para fotos e fundos escuros. */
  tone?: "default" | "inverse";
};

/**
 * Logo oficial do LalaIA. Já contém o nome, então é anunciada como "LalaIA" para leitores de tela.
 * Defina só a altura (ex.: `className="h-8"`); a largura acompanha a proporção.
 */
export function Logo({ tone = "default", className, ...props }: LogoProps) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
      role="img"
      aria-label="LalaIA"
      className={cn("h-8 w-auto shrink-0", tone === "inverse" ? "text-white" : "text-logo", className)}
      {...props}
    >
      <path d={LOGO_WORDMARK_PATH} fill="currentColor" fillRule="evenodd" />
      <path d={LOGO_PIN_PATH} fill={LOGO_COLORS.red} fillRule="evenodd" />
    </svg>
  );
}
