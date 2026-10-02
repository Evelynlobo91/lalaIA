// Datas no fuso de Joinville (America/Sao_Paulo). O banco guarda em UTC (timestamptz);
// formulários usam <input type="datetime-local"> ("2026-10-10T20:00"), que não tem fuso.

export const TIMEZONE = "America/Sao_Paulo";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localParts(date: Date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute };
}

/** "2026-10-10T20:00" (horário de Joinville) → instante UTC. `null` se o texto for inválido. */
export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const wantedUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Ajusta pelo deslocamento real do fuso nessa data (funciona mesmo se houver horário de verão).
  const guess = new Date(wantedUtc);
  const lp = localParts(guess);
  const offset = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute) - wantedUtc;
  const result = new Date(wantedUtc - offset);
  // Data inexistente (ex.: 2026-02-31) → recusa em vez de "pular" para outro dia.
  const check = localParts(result);
  return check.year === y && check.month === mo && check.day === d && check.hour === h && check.minute === mi ? result : null;
}

/** Instante → "2026-10-10T20:00" em Joinville (para preencher o formulário). */
export function toLocalInput(date: Date): string {
  const p = localParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });

/** "sáb., 10 de out., 20:00" */
export const formatDateTime = (date: Date) => dateTimeFormatter.format(date);
/** "20:00" */
export const formatTime = (date: Date) => timeFormatter.format(date);

/** "2026-10-10": data no calendário de Joinville. */
export function localDate(date: Date): string {
  return toLocalInput(date).slice(0, 10);
}

/** Instante da meia-noite (00:00 em Joinville) do dia "YYYY-MM-DD", somando `plusDays` dias de calendário. */
export function localMidnight(isoDate: string, plusDays = 0): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + plusDays));
  const day = shifted.toISOString().slice(0, 10);
  return fromLocalInput(`${day}T00:00`)!;
}

/** Dia da semana (0 = domingo) no calendário de Joinville. */
export function localWeekday(date: Date): number {
  const [y, m, d] = localDate(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Mesmo dia no calendário de Joinville? */
export function sameLocalDay(a: Date, b: Date): boolean {
  const x = localParts(a);
  const y = localParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}
