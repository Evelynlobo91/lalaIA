/** Regras de "acontecendo agora" e "em breve" (RF17/RF40), usadas pela lista, pelo detalhe e pela tela "Agora". */

/** "Em breve" = começa nas próximas 3 horas. */
export const SOON_WINDOW_MS = 3 * 3_600_000;

type Period = { startsAt: Date; endsAt: Date };

/** Acontecendo no instante `at`: já começou (inclusive) e ainda não terminou (fim exclusivo). */
export function isHappeningAt(event: Period, at: Date): boolean {
  return event.startsAt.getTime() <= at.getTime() && at.getTime() < event.endsAt.getTime();
}

/** Ainda não começou, mas começa dentro da janela (padrão: 3 h). */
export function startsSoon(event: Pick<Period, "startsAt">, at: Date, windowMs = SOON_WINDOW_MS): boolean {
  const diff = event.startsAt.getTime() - at.getTime();
  return diff > 0 && diff <= windowMs;
}

/** "1 h 20 min", "45 min", "3 h". Arredonda para baixo no minuto. */
function duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "Começou agora" (menos de 1 min), "Começou há 25 min", "Começou há 1 h 20 min". */
export function startedLabel(startsAt: Date, at: Date): string {
  const ms = at.getTime() - startsAt.getTime();
  return ms < 60_000 ? "Começou agora" : `Começou há ${duration(ms)}`;
}

/** "Começa em instantes" (menos de 1 min), "Começa em 40 min", "Começa em 2 h 10 min". */
export function startsInLabel(startsAt: Date, at: Date): string {
  const ms = startsAt.getTime() - at.getTime();
  return ms < 60_000 ? "Começa em instantes" : `Começa em ${duration(ms)}`;
}
