import Link from "next/link";
import { cn } from "@/shared/ui";
import { TIMEZONE, localDate, localMidnight } from "@/shared/time/joinville-time";

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: TIMEZONE });
const day = new Intl.DateTimeFormat("pt-BR", { day: "numeric", timeZone: TIMEZONE });
const fullDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TIMEZONE });

/** Próximos dias (hoje + 4) como atalhos para a agenda daquele dia, no calendário de Joinville. */
export function DateStrip({ now, days = 5 }: { now: Date; days?: number }) {
  const today = localDate(now);

  return (
    <nav aria-label="Agenda dos próximos dias">
      <ul className="grid grid-cols-5 gap-2">
        {Array.from({ length: days }, (_, i) => {
          // Meio-dia evita cair no dia anterior/seguinte por causa do fuso.
          const date = new Date(localMidnight(today, i).getTime() + 12 * 3_600_000);
          const isToday = i === 0;
          const label = isToday ? "Hoje" : weekday.format(date).replace(".", "");
          return (
            <li key={i}>
              <Link
                href={`/eventos?quando=${isToday ? "hoje" : localDate(date)}`}
                prefetch={false}
                aria-label={`Eventos de ${isToday ? "hoje, " : ""}${fullDate.format(date)}`}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border text-center transition",
                  isToday ? "border-brand bg-brand text-brand-fg shadow-sm" : "border-border bg-surface hover:border-brand",
                )}
              >
                <span className={cn("text-[11px] font-semibold uppercase tracking-wide", !isToday && "text-muted")}>{label}</span>
                <span className="text-lg leading-none font-bold">{day.format(date)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Quinta, 1 de outubro" para o topo do início. */
export function todayLabel(now: Date): string {
  const text = fullDate.format(now).replace("-feira", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
