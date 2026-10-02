import { Lock, Trophy } from "lucide-react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, CardDescription, CardTitle } from "@/shared/ui";
import type { AchievementsOverview, AchievementView } from "../achievements.use-case";
import { ShareAchievementButton } from "../../share/ui/share-achievement-button";

/** Galeria do perfil: conquistas desbloqueadas e, abaixo, as bloqueadas com a dica de como conseguir. */
export function AchievementsCard({ overview }: { overview: AchievementsOverview }) {
  return (
    <Card className="flex flex-col gap-3" aria-labelledby="conquistas-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="conquistas-titulo" className="flex items-center gap-2">
          <Trophy aria-hidden className="size-5 text-brand" /> Conquistas
        </CardTitle>
        <span className="text-sm text-muted">
          {overview.unlocked.length} de {overview.total} desbloqueadas
        </span>
      </div>
      {overview.unlocked.length === 0 && <CardDescription>Explore a cidade para desbloquear a primeira conquista.</CardDescription>}
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Conquistas">
        {overview.unlocked.map((a) => (
          <AchievementItem key={a.id} achievement={a} />
        ))}
        {overview.locked.map((a) => (
          <AchievementItem key={a.id} achievement={a} />
        ))}
      </ul>
    </Card>
  );
}

function AchievementItem({ achievement: a }: { achievement: AchievementView }) {
  const unlocked = a.unlockedAt !== null;
  return (
    <li
      aria-label={`${a.title}: ${unlocked ? "desbloqueada" : "bloqueada"}`}
      className={unlocked ? "flex gap-3 rounded-xl border border-brand p-3" : "flex gap-3 rounded-xl border border-dashed border-border p-3 text-muted"}
    >
      {unlocked ? <Trophy aria-hidden className="size-6 shrink-0 text-brand" /> : <Lock aria-hidden className="size-6 shrink-0" />}
      <div className="flex min-w-0 flex-col gap-1">
        <p className={unlocked ? "font-semibold text-fg" : "font-semibold"}>{a.title}</p>
        {unlocked ? (
          <>
            <p className="text-sm">{a.description}</p>
            <p className="text-xs text-muted">Desbloqueada em {formatDateTime(a.unlockedAt!)}</p>
            {a.unlockId && <ShareAchievementButton unlockId={a.unlockId} title={a.title} />}
          </>
        ) : (
          <p className="text-sm">
            <span className="sr-only">Como desbloquear: </span>
            {a.hint}
          </p>
        )}
        {a.bonusXp > 0 && (
          <Badge variant={unlocked ? "success" : "neutral"} className="self-start">
            +{a.bonusXp} XP
          </Badge>
        )}
      </div>
    </li>
  );
}
