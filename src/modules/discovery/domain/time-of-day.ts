import { localDate, localMidnight } from "@/shared/time/joinville-time";
import type { Period } from "./search";

/** Filtro de horário (RF05). Valores da URL. */
export const timeOfDayValues = ["agora", "manha", "tarde", "noite"] as const;
export type TimeOfDay = (typeof timeOfDayValues)[number];

export const timeOfDayLabels: Record<TimeOfDay, string> = {
  agora: "Agora",
  manha: "Manhã (6h–12h)",
  tarde: "Tarde (12h–18h)",
  noite: "Noite (18h–6h)",
};

/** Minutos desde a meia-noite (Joinville). A noite passa da meia-noite: vai até 6h do dia seguinte. */
const dayParts: Record<Exclude<TimeOfDay, "agora">, { from: number; to: number }> = {
  manha: { from: 6 * 60, to: 12 * 60 },
  tarde: { from: 12 * 60, to: 18 * 60 },
  noite: { from: 18 * 60, to: 30 * 60 },
};

const MINUTE = 60_000;

/** Dias do calendário de Joinville ("AAAA-MM-DD") que o período toca. */
function daysOf(window: Period): string[] {
  const first = localDate(window.from);
  const days: string[] = [];
  for (let i = 0; localMidnight(first, i) < window.to; i++) days.push(localDate(localMidnight(first, i)));
  return days;
}

/**
 * Períodos resultantes da combinação data + horário, sempre a partir de agora (o passado não interessa).
 * - só data → o período da data (ex.: o dia todo de hoje);
 * - só horário → esse horário hoje (e o fim da noite de ontem, se ainda for madrugada);
 * - data + horário → esse horário em cada dia da data (ex.: sábado e domingo à noite);
 * - "agora" → o instante atual (vazio se a data escolhida não inclui agora).
 * `null` = sem filtro de tempo.
 */
export function timePeriods(dateWindow: Period | null, timeOfDay: TimeOfDay | null, now: Date): Period[] | null {
  if (!dateWindow && !timeOfDay) return null;

  let periods: Period[];
  if (timeOfDay === "agora") {
    periods = !dateWindow || (dateWindow.from <= now && now < dateWindow.to) ? [{ from: now, to: now }] : [];
  } else if (timeOfDay) {
    const part = dayParts[timeOfDay];
    const today = localDate(now);
    const days = dateWindow ? daysOf(dateWindow) : [localDate(localMidnight(today, -1)), today];
    periods = days.map((day) => {
      const midnight = localMidnight(day).getTime();
      return { from: new Date(midnight + part.from * MINUTE), to: new Date(midnight + part.to * MINUTE) };
    });
  } else {
    periods = [dateWindow!];
  }

  // Corta o que já passou.
  return periods.filter((p) => p.to > now || p.from.getTime() === p.to.getTime()).map((p) => (p.from < now && p.from.getTime() !== p.to.getTime() ? { from: now, to: p.to } : p));
}
