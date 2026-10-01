import { parseOpeningHours } from "./opening-hours";

/** Horário de um dia no editor do parceiro: fechado ou um intervalo (abre–fecha). */
export type DaySchedule = { open: boolean; from: string; to: string };
/** Segunda a domingo (índice 0 = segunda), na ordem em que o parceiro vê. */
export type WeeklySchedule = DaySchedule[];

const OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
// parseOpeningHours usa 0 = domingo; o editor usa 0 = segunda.
const toParserDay = (editorDay: number) => (editorDay + 1) % 7;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const emptySchedule = (): WeeklySchedule => Array.from({ length: 7 }, () => ({ open: false, from: "09:00", to: "18:00" }));

/**
 * Converte o horário do OSM para o editor. Dias com mais de um intervalo ficam com o primeiro
 * (`simplified: true` avisa o parceiro). Formato não reconhecido → semana vazia.
 */
export function scheduleFromOsm(value: string | null): { schedule: WeeklySchedule; simplified: boolean } {
  const rules = parseOpeningHours(value);
  if (!rules) return { schedule: emptySchedule(), simplified: Boolean(value) };
  let simplified = false;
  const schedule = OSM_DAYS.map((_, day) => {
    const rule = rules.filter((r) => r.days.has(toParserDay(day))).at(-1);
    if (!rule || rule.ranges === "off") return { open: false, from: "09:00", to: "18:00" };
    if (rule.ranges.length > 1) simplified = true;
    const [start, end] = rule.ranges[0];
    return { open: true, from: hhmm(start), to: hhmm(end) };
  });
  return { schedule, simplified };
}

/**
 * Converte o editor para o formato do OSM, agrupando dias seguidos com o mesmo horário:
 * Seg–Sex 11–14 e Sáb 10–16 → "Mo-Fr 11:00-14:00; Sa 10:00-16:00". Semana toda fechada → null.
 */
export function osmFromSchedule(schedule: WeeklySchedule): string | null {
  const key = (d: DaySchedule) => (d.open ? `${d.from}-${d.to}` : "off");
  const groups: Array<{ start: number; end: number; hours: string }> = [];
  schedule.forEach((day, i) => {
    const hours = key(day);
    const last = groups.at(-1);
    if (last && last.hours === hours && last.end === i - 1) last.end = i;
    else groups.push({ start: i, end: i, hours });
  });
  const parts = groups
    .filter((g) => g.hours !== "off")
    .map((g) => `${g.start === g.end ? OSM_DAYS[g.start] : `${OSM_DAYS[g.start]}-${OSM_DAYS[g.end]}`} ${g.hours}`);
  return parts.length ? parts.join("; ") : null;
}
