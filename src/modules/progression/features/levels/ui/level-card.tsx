import { PartyPopper, TrendingUp } from "lucide-react";
import { Badge, Card, CardDescription, CardTitle, cn } from "@/shared/ui";
import type { LevelOverview } from "../levels.use-case";

const xpFormat = new Intl.NumberFormat("pt-BR");

/** Seção do perfil: nível atual, barra até o próximo e quanto falta. Destaca a subida de nível recente. */
export function LevelCard({ overview }: { overview: LevelOverview }) {
  const { level, name, next, remaining, percent, recentLevelUp } = overview;
  return (
    <Card className={cn("flex flex-col gap-3", recentLevelUp && "border-brand")} aria-labelledby="nivel-titulo">
      {recentLevelUp && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg">
          <PartyPopper aria-hidden className="size-4" /> Você subiu para o nível {level}!
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="nivel-titulo" className="flex items-center gap-2">
          <TrendingUp aria-hidden className="size-5 text-brand" /> Seu nível
        </CardTitle>
        <Badge variant="brand">Nível {level}</Badge>
      </div>
      <p className="text-lg font-semibold">{name}</p>
      <div
        role="progressbar"
        aria-labelledby="nivel-progresso"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={next ? `${percent}% até o nível ${next.level}` : "Nível máximo"}
        className="h-3 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <CardDescription id="nivel-progresso">
        {next ? (
          <>
            Faltam <strong className="text-fg">{xpFormat.format(remaining)} XP</strong> para o nível {next.level}: {next.name}.
          </>
        ) : (
          "Você chegou ao nível máximo. Joinville é sua!"
        )}
      </CardDescription>
    </Card>
  );
}
