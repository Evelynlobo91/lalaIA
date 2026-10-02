import type { Availability } from "./candidate";

/** Passo das sondagens de horário (min): erra para menos, nunca promete um lugar aberto que já fechou. */
export const OPENING_PROBE_MINUTES = 10;

/**
 * Primeiro trecho aberto entre `from` e `to`, a partir de uma regra "está aberto em t?" (ex.: `isOpenAt`
 * do horário OSM). Sonda de `stepMinutes` em `stepMinutes` (e no próprio `to`). Conservador: o fim é a
 * última sondagem ainda aberta.
 * - horário não reconhecido → `{ known: false }`;
 * - fechado o período todo → `{ known: true, window: null }`.
 */
export function openWindow(isOpen: (at: Date) => boolean | null, from: Date, to: Date, stepMinutes = OPENING_PROBE_MINUTES): Availability {
  if (isOpen(from) === null) return { known: false };
  const probes: number[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += stepMinutes * 60_000) probes.push(t);
  probes.push(Math.max(from.getTime(), to.getTime()));

  let start: number | null = null;
  let end: number | null = null;
  for (const t of probes) {
    if (isOpen(new Date(t)) === true) {
      start ??= t;
      end = t;
    } else if (start !== null) {
      break;
    }
  }
  return { known: true, window: start !== null && end !== null ? { start: new Date(start), end: new Date(end) } : null };
}
