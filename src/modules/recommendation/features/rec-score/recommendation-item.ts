import { formatPrice, isHappeningAt, startedLabel, startsInLabel } from "@/modules/events";
import { formatDistance } from "@/modules/places";
import { formatDateTime, formatTime } from "@/shared/time/joinville-time";
import type { CandidateKind } from "../../domain/candidate";
import type { Recommendation } from "../../domain/score";
import { durationLabel } from "../../domain/signals";

/** Item pronto para a tela e para a API (serializável). */
export type RecommendationItem = {
  key: string;
  kind: CandidateKind;
  id: string;
  title: string;
  href: string;
  categoryLabel: string | null;
  placeName: string | null;
  neighborhood: string | null;
  /** "Começou há 25 min", "Começa em 40 min", "Aberto agora", "Até sáb., 10 de out., 20:00". */
  timeLabel: string | null;
  /** Instante de início (ISO) quando já começou: base do "há quanto tempo". */
  startedAt: string | null;
  distanceMeters: number | null;
  distanceLabel: string | null;
  priceLabel: string | null;
  live: boolean;
  /** Destaque pago pelo parceiro (#29): a tela sinaliza como "Patrocinado". */
  sponsored: boolean;
  score: number;
  /** Do motivo que mais pesou para o que menos: "Porque você curte Shows e música". */
  reasons: string[];
};

/** Gasto estimado por pessoa de uma missão: "Grátis" ou "R$ 25,00/pessoa". */
const missionCost = (cents: number) => (cents === 0 ? "Grátis" : `${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/pessoa`);

const kindLabel: Record<CandidateKind, string> = { event: "Evento", place: "Lugar", mission: "Missão" };
export const recommendationKindLabel = (kind: CandidateKind) => kindLabel[kind];

export function toRecommendationItem({ candidate: c, score, reasons }: Recommendation, now: Date): RecommendationItem {
  const window = c.availability.known ? c.availability.window : null;
  const period = window ? { startsAt: window.start, endsAt: window.end } : null;
  const happening = period !== null && isHappeningAt(period, now);

  let timeLabel: string | null = null;
  if (c.kind === "event" && period) timeLabel = happening ? startedLabel(period.startsAt, now) : startsInLabel(period.startsAt, now);
  else if (c.kind === "place" && period) timeLabel = happening ? "Aberto agora" : `Abre às ${formatTime(period.startsAt)}`;
  else if (c.kind === "mission" && period) timeLabel = `${c.durationMinutes != null ? `Cerca de ${durationLabel(c.durationMinutes)} · ` : ""}até ${formatDateTime(period.endsAt)}`;

  let priceLabel: string | null = null;
  if (c.kind === "mission" && c.xp !== null) priceLabel = c.priceCents === null ? `${c.xp} XP` : `${c.xp} XP · ${missionCost(c.priceCents)}`;
  else if (c.priceCents !== null) priceLabel = formatPrice(c.priceCents);

  return {
    key: `${c.kind}:${c.id}`,
    kind: c.kind,
    id: c.id,
    title: c.title,
    href: c.href,
    categoryLabel: c.categoryLabel,
    placeName: c.kind === "place" ? null : c.placeName,
    neighborhood: c.neighborhood,
    timeLabel,
    startedAt: c.kind === "event" && happening && period ? period.startsAt.toISOString() : null,
    distanceMeters: c.distanceMeters,
    distanceLabel: c.distanceMeters === null ? null : formatDistance(c.distanceMeters),
    priceLabel,
    live: reasons.some((r) => r.signal === "live"),
    score,
    sponsored: reasons.some((r) => r.signal === "sponsored"),
    reasons: reasons.filter((r) => r.signal !== "sponsored").map((r) => r.text),
  };
}
