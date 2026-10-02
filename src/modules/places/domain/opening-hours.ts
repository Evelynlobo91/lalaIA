// Interpretador do formato de horários do OpenStreetMap (subconjunto mais comum).
// Ex.: "24/7", "Mo-Fr 11:00-14:30; Sa 11:00-15:00", "Tu-Su 18:00-02:00", "Mo,We 09:00-12:00,14:00-18:00", "Su off".
// Regras que não reconhecemos → null ("não sei"): melhor não mostrar do que mostrar errado.

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const TIMEZONE = "America/Sao_Paulo";

type Rule = { days: Set<number>; ranges: Array<[number, number]> | "off" };

function parseDays(spec: string): Set<number> | null {
  const days = new Set<number>();
  // "PH" (feriados): não temos o calendário de feriados, então essas regras são ignoradas.
  const parts = spec
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "PH");
  for (const part of parts) {
    const [from, to] = part.split("-");
    const a = DAYS.indexOf(from as (typeof DAYS)[number]);
    const b = to === undefined ? a : DAYS.indexOf(to as (typeof DAYS)[number]);
    if (a < 0 || b < 0) return null;
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return days;
}

function parseMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) <= 24 && Number(m[2]) < 60 && minutes <= 24 * 60 ? minutes : null;
}

function parseRanges(spec: string): Array<[number, number]> | "off" | null {
  if (spec === "off" || spec === "closed") return "off";
  const ranges: Array<[number, number]> = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-");
    const start = parseMinutes(a ?? "");
    const end = parseMinutes(b ?? "");
    if (start === null || end === null) return null;
    ranges.push([start, end]);
  }
  return ranges;
}

/** Horários digitados em português no OSM: "de 06:30 às 20:00" → "06:30-20:00". */
function normalize(value: string): string {
  return value
    .replace(/\bde\s+(?=\d)/gi, "")
    .replace(/(\d{1,2}:\d{2})\s*(?:às|ás|as|a|até)\s*(\d{1,2}:\d{2})/gi, "$1-$2")
    .replace(/,\s+/g, ",")
    .trim();
}

export function parseOpeningHours(value: string | null | undefined): Rule[] | null {
  const text = value ? normalize(value) : "";
  if (!text) return null;
  if (text === "24/7") return [{ days: new Set([0, 1, 2, 3, 4, 5, 6]), ranges: [[0, 24 * 60]] }];

  const rules: Rule[] = [];
  for (const raw of text.split(";")) {
    const rule = raw.trim();
    if (!rule) continue;
    // "Mo-Fr 09:00-18:00" | "09:00-18:00" (todos os dias) | "Su off"
    const match = /^(?:([A-Za-z,-]+)\s+)?(.+)$/.exec(rule);
    if (!match) return null;
    const days = match[1] ? parseDays(match[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    const ranges = parseRanges(match[2].replace(/\s+/g, ""));
    if (!days || !ranges) return null;
    if (days.size > 0) rules.push({ days, ranges }); // regra só de feriado (PH) não entra
  }
  return rules.length ? rules : null;
}

/** Dia da semana (0 = domingo) e minuto do dia no fuso de Joinville. */
function localTime(date: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: DAYS.indexOf(get("weekday").slice(0, 2) as (typeof DAYS)[number]), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Está aberto em `date`? `true`/`false` quando o horário é reconhecido; `null` quando não dá para saber.
 * Regras posteriores sobrescrevem as anteriores para os mesmos dias (como no OSM).
 */
export function isOpenAt(openingHours: string | null | undefined, date: Date): boolean | null {
  const rules = parseOpeningHours(openingHours);
  if (!rules) return null;
  const { day, minute } = localTime(date);
  const yesterday = (day + 6) % 7;

  const ruleFor = (d: number) => rules.filter((r) => r.days.has(d)).at(-1);
  const today = ruleFor(day);
  const previous = ruleFor(yesterday);

  // Faixa que vira a madrugada (ex.: 18:00-02:00) de ontem ainda vale hoje cedo.
  const fromYesterday = previous && previous.ranges !== "off" && previous.ranges.some(([s, e]) => e < s && minute < e);
  if (fromYesterday) return true;
  if (!today || today.ranges === "off") return false;
  return today.ranges.some(([s, e]) => (e > s ? minute >= s && minute < e : minute >= s));
}
