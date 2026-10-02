import { z } from "zod";
import { localDate, localMidnight, localWeekday } from "@/shared/time/joinville-time";

/** Atalhos de data da lista de eventos (RF15), sempre no calendário de Joinville. */
export type DateFilter = { kind: "hoje" } | { kind: "amanha" } | { kind: "fim-de-semana" } | { kind: "data"; date: string };

export type DateWindow = { from: Date; to: Date };

/** Valor da URL: "hoje", "amanha", "fim-de-semana" ou "AAAA-MM-DD". */
export const dateFilterParam = z
  .string()
  .max(20)
  .optional()
  .transform((value, ctx): DateFilter | null => {
    if (!value) return null;
    if (value === "hoje" || value === "amanha" || value === "fim-de-semana") return { kind: value };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().startsWith(value)) {
      return { kind: "data", date: value };
    }
    ctx.addIssue({ code: "custom", message: "Data inválida." });
    return z.NEVER;
  });

/** Volta o filtro para o valor da URL. */
export function dateFilterValue(filter: DateFilter): string {
  return filter.kind === "data" ? filter.date : filter.kind;
}

/**
 * Período do filtro (início inclusivo, fim exclusivo). Um evento entra quando se SOBREPÕE ao período
 * (uma feira de 3 dias aparece em cada um dos dias).
 * "Este fim de semana" = sábado 00:00 até segunda 00:00; no sábado/domingo é o fim de semana corrente.
 */
export function dateWindow(filter: DateFilter, now: Date): DateWindow {
  const today = localDate(now);
  switch (filter.kind) {
    case "hoje":
      return { from: localMidnight(today), to: localMidnight(today, 1) };
    case "amanha":
      return { from: localMidnight(today, 1), to: localMidnight(today, 2) };
    case "data":
      return { from: localMidnight(filter.date), to: localMidnight(filter.date, 1) };
    case "fim-de-semana": {
      const weekday = localWeekday(now); // 0 = domingo, 6 = sábado
      const toSaturday = weekday === 0 ? -1 : 6 - weekday;
      return { from: localMidnight(today, toSaturday), to: localMidnight(today, toSaturday + 2) };
    }
  }
}

export const dateFilterLabels: Record<Exclude<DateFilter["kind"], "data">, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  "fim-de-semana": "Este fim de semana",
};
