import { cn } from "./cn";

const sizes = { sm: "size-9 text-sm", md: "size-14 text-xl", lg: "size-24 text-3xl" } as const;

type AvatarProps = { name: string; src?: string | null; size?: keyof typeof sizes; className?: string };

/** Foto de perfil com fallback para a inicial do nome. */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", sizes[size], className);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage, já com tamanho limitado
    return <img src={src} alt={`Foto de ${name}`} className={cn(base, "object-cover")} />;
  }
  return (
    <span aria-hidden className={cn(base, "bg-brand font-bold text-brand-fg")}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
