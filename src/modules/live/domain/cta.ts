// CTAs programados (#93): chamadas para ação que aparecem sobre o player em horários definidos pelo parceiro.
import { formatDateTime, formatTime, localDate, localMidnight } from "@/shared/time/joinville-time";

export const CTA_TYPES = ["promocao", "missao", "quero-ir", "evento", "link"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CTA_TYPE_LABELS: Record<CtaType, string> = {
  promocao: "Promoção",
  missao: "Missão",
  "quero-ir": "Quero ir",
  evento: "Evento",
  link: "Link",
};

/** 1 = alta, 2 = normal, 3 = baixa. Se dois coincidirem, aparece o de maior prioridade. */
export const CTA_PRIORITIES = [1, 2, 3] as const;
export type CtaPriority = (typeof CTA_PRIORITIES)[number];
export const CTA_PRIORITY_LABELS: Record<CtaPriority, string> = { 1: "Alta", 2: "Normal", 3: "Baixa" };

export const CTA_LIMITS = {
  perStream: 20,
  title: { min: 3, max: 60 },
  body: { max: 140 },
  buttonLabel: { min: 2, max: 24 },
  offsetMinutes: { min: 0, max: 720 },
  durationMinutes: { min: 1, max: 180 },
  intervalMinutes: { min: 5, max: 720 },
  absoluteHours: 24,
} as const;

/**
 * Quando o CTA aparece:
 * - `absolute`: horário marcado (início e fim);
 * - `relative`: tantos minutos depois de a live entrar no ar, por uma duração;
 * - `recurring`: a cada intervalo, contado do início da live, por uma duração.
 */
export type CtaSchedule =
  | { kind: "absolute"; startsAt: Date; endsAt: Date }
  | { kind: "relative"; offsetMinutes: number; durationMinutes: number }
  | { kind: "recurring"; intervalMinutes: number; durationMinutes: number };

export type CtaScheduleKind = CtaSchedule["kind"];
export const CTA_SCHEDULE_KINDS = ["absolute", "relative", "recurring"] as const satisfies readonly CtaScheduleKind[];

export type CtaRecord = {
  id: string;
  streamId: string;
  ownerId: string;
  type: CtaType;
  /** Oferta, missão ou evento (conforme o tipo); null para "Quero ir" e link. */
  refId: string | null;
  /** Destino do toque: página do app ou endereço externo (https). */
  href: string;
  external: boolean;
  title: string;
  body: string | null;
  buttonLabel: string;
  priority: CtaPriority;
  schedule: CtaSchedule;
  /** Disparo manual (#181): solta pelo parceiro em `triggeredAt`, fica no ar até `triggeredUntil`. */
  triggeredAt: Date | null;
  triggeredUntil: Date | null;
  createdAt: Date;
};

export type CtaWindow = { start: Date; end: Date };

const MINUTE = 60_000;

/**
 * Janelas do CTA que tocam o intervalo [from, to). Os agendamentos relativo e recorrente dependem de quando a
 * live entrou no ar (`liveSince`); sem isso, não há janela.
 */
export function windowsBetween(schedule: CtaSchedule, from: Date, to: Date, liveSince: Date | null, max = 200): CtaWindow[] {
  const touches = (w: CtaWindow) => w.start < to && w.end > from;
  if (schedule.kind === "absolute") {
    const w = { start: schedule.startsAt, end: schedule.endsAt };
    return touches(w) ? [w] : [];
  }
  if (!liveSince) return [];
  const base = liveSince.getTime();
  const duration = schedule.durationMinutes * MINUTE;
  if (schedule.kind === "relative") {
    const start = base + schedule.offsetMinutes * MINUTE;
    const w = { start: new Date(start), end: new Date(start + duration) };
    return touches(w) ? [w] : [];
  }
  // Recorrente: a primeira aparição é um intervalo depois do início (a live não abre com o CTA na tela).
  const interval = schedule.intervalMinutes * MINUTE;
  const first = Math.max(1, Math.floor((from.getTime() - base - duration) / interval) + 1);
  const windows: CtaWindow[] = [];
  for (let k = first; windows.length < max; k++) {
    const start = base + k * interval;
    if (start >= to.getTime()) break;
    const w = { start: new Date(start), end: new Date(start + duration) };
    if (touches(w)) windows.push(w);
  }
  return windows;
}

/** A janela em que o CTA está valendo em `now`, ou null. */
export function windowAt(schedule: CtaSchedule, now: Date, liveSince: Date | null): CtaWindow | null {
  return windowsBetween(schedule, now, new Date(now.getTime() + 1), liveSince, 1)[0] ?? null;
}

/** A janela do disparo manual, se ele ainda vale em `now`. */
export function triggerWindowAt(cta: Pick<CtaRecord, "triggeredAt" | "triggeredUntil">, now: Date): CtaWindow | null {
  if (!cta.triggeredAt || !cta.triggeredUntil) return null;
  return cta.triggeredAt <= now && now < cta.triggeredUntil ? { start: cta.triggeredAt, end: cta.triggeredUntil } : null;
}

/** "sáb., 10 de out., 20:00 até 21:00", "15 min depois de entrar ao vivo, por 10 min", "A cada 30 min, por 5 min". */
export function describeSchedule(schedule: CtaSchedule): string {
  if (schedule.kind === "absolute") {
    const sameDay = localDate(schedule.startsAt) === localDate(schedule.endsAt);
    return `${formatDateTime(schedule.startsAt)} até ${sameDay ? formatTime(schedule.endsAt) : formatDateTime(schedule.endsAt)}`;
  }
  if (schedule.kind === "relative") {
    const when = schedule.offsetMinutes === 0 ? "Assim que entrar ao vivo" : `${schedule.offsetMinutes} min depois de entrar ao vivo`;
    return `${when}, por ${schedule.durationMinutes} min`;
  }
  return `A cada ${schedule.intervalMinutes} min, por ${schedule.durationMinutes} min`;
}

export type CtaAgendaEntry = { ctaId: string; title: string; priority: CtaPriority; start: Date; end: Date };

/**
 * Agenda do dia (calendário de Joinville): as aparições com horário, em ordem, e os CTAs que dependem de a live
 * entrar no ar (relativos e recorrentes, enquanto ela não está ao vivo).
 */
export function agendaOfDay(ctas: CtaRecord[], now: Date, liveSince: Date | null): { timed: CtaAgendaEntry[]; whenLive: CtaRecord[] } {
  const dayStart = localMidnight(localDate(now));
  const dayEnd = localMidnight(localDate(now), 1);
  const timed = ctas
    .flatMap((cta) => [...windowsBetween(cta.schedule, dayStart, dayEnd, liveSince, 48), ...(cta.triggeredAt && cta.triggeredUntil && cta.triggeredUntil > now ? [{ start: cta.triggeredAt, end: cta.triggeredUntil }] : [])].map((w) => ({ ctaId: cta.id, title: cta.title, priority: cta.priority, start: w.start, end: w.end })))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.priority - b.priority);
  const whenLive = liveSince ? [] : ctas.filter((cta) => cta.schedule.kind !== "absolute");
  return { timed, whenLive };
}

/** Domínios aceitos no CTA do tipo link (reserva, cardápio, redes do parceiro). Configurável por LIVE_CTA_LINK_DOMAINS. */
export const DEFAULT_CTA_LINK_DOMAINS = ["instagram.com", "facebook.com", "wa.me", "whatsapp.com", "ifood.com.br", "sympla.com.br", "linktr.ee", "google.com", "youtube.com"] as const;

export function ctaLinkDomainsFrom(value: string | undefined): string[] {
  const custom = (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  return custom.length > 0 ? custom : [...DEFAULT_CTA_LINK_DOMAINS];
}

/** Endereço https de um domínio permitido (o próprio ou um subdomínio), sem usuário/senha. Devolve o endereço normalizado. */
export function allowedLink(raw: string, domains: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  return url.toString();
}
