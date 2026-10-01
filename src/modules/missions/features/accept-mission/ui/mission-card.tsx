import { CalendarClock, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card } from "@/shared/ui";
import type { MissionCard } from "../mission-catalog";

/** Card de missão (lista pública e "suas missões"). `footer` recebe a ação (aceitar, progresso...). */
export function MissionCardView({ mission, footer, badge }: { mission: MissionCard; footer?: ReactNode; badge?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-tight">
          <Link href={`/missoes/${mission.id}`} className="hover:underline">
            {mission.title}
          </Link>
        </h3>
        {badge ?? <Badge variant="brand">{mission.xp} XP</Badge>}
      </div>
      <p className="line-clamp-3 text-sm">{mission.description}</p>
      <p className="flex items-start gap-1.5 text-sm text-muted">
        {mission.surprise ? <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" /> : <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>
          {mission.stepCount} {mission.stepCount === 1 ? "etapa" : "etapas"}
          {mission.surprise ? " surpresa: reveladas uma por vez" : `: ${mission.places.map((p) => p.name).join(", ")}`}
        </span>
      </p>
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <CalendarClock aria-hidden className="size-4 shrink-0" /> Até {formatDateTime(mission.endsAt)}
      </p>
      {footer}
    </Card>
  );
}
