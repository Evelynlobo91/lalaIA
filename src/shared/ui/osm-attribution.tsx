import { cn } from "./cn";

/** Atribuição exigida pela licença ODbL em toda tela que exibe dados do OpenStreetMap. */
export function OsmAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      Dados de lugares ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
        OpenStreetMap contributors
      </a>
    </p>
  );
}
