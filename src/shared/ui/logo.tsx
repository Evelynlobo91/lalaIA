import { cn } from "./cn";

/**
 * Logo do LalaIA ("lala" azul-marinho + "ia" e pin vermelho). PNG pequeno (64 px de altura, 2× para telas
 * retina). No tema escuro vai sobre uma pílula clara: o azul-marinho some no fundo escuro.
 */
export function Logo({ className, height = 32 }: { className?: string; height?: number }) {
  const width = Math.round((height * 112) / 64);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- PNG estático pequeno; next/image não traz ganho aqui
    <img
      src="/logo.png"
      alt="LalaIA"
      width={width}
      height={height}
      className={cn("block dark:rounded-lg dark:bg-white dark:px-1.5 dark:py-0.5", className)}
    />
  );
}
