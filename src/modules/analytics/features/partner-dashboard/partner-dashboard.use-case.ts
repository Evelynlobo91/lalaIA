import { NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { localDate } from "@/shared/time/joinville-time";
import type { DailyMetric, EntityRefs } from "../../domain/daily-metrics";
import type { GetDailyMetrics } from "../aggregations/aggregations.use-case";
import type { PartnerDashboardParams, Period } from "./partner-dashboard.schema";

export type ResourceType = "place" | "event" | "mission";

/** Recurso do parceiro (resolvido pelos módulos donos, a partir do id da sessão). */
export type PartnerResource = { type: ResourceType; id: string; name: string; liveStreamIds: string[] };

/** Porta: os recursos do PRÓPRIO parceiro. É ela que garante o isolamento entre parceiros. */
export interface PartnerResources {
  resourcesOf(userId: string): Promise<PartnerResource[]>;
}

export type MetricId = "views" | "favorites" | "queroIr" | "liveViews" | "checkins" | "conversion";

export type MetricView = {
  id: MetricId;
  label: string;
  /** Total no período (conversão: %, com uma casa). */
  total: number;
  previousTotal: number;
  unit: "count" | "percent";
  series: Array<{ day: string; value: number }>;
};

export type ResourceRow = { key: string; type: ResourceType; name: string; totals: Record<Exclude<MetricId, "conversion">, number> };

export type PartnerDashboardView = {
  period: Period;
  from: string;
  to: string;
  resources: Array<{ key: string; type: ResourceType; name: string }>;
  selected: string | null;
  metrics: MetricView[];
  breakdown: ResourceRow[];
};

const labels: Record<MetricId, string> = {
  views: "Visualizações",
  favorites: "Favoritos",
  queroIr: "\"Quero ir\"",
  liveViews: "Acessos à live",
  checkins: "Check-ins",
  conversion: "Conversão",
};

const keyOf = (r: Pick<PartnerResource, "type" | "id">) => `${r.type}:${r.id}`;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const conversion = (views: number, actions: number) => (views > 0 ? round1((actions / views) * 100) : 0);

/**
 * #78 — Painel do promotor: as 6 métricas por dia no período (com o período anterior para comparar) e
 * o detalhamento por lugar/evento/missão. Só entra o que é do parceiro da sessão: recurso alheio → 404.
 * Conversão = ("Quero ir" + check-ins) ÷ visualizações.
 */
export class PartnerDashboard {
  constructor(
    private readonly resources: PartnerResources,
    private readonly metrics: Pick<GetDailyMetrics, "execute">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, params: PartnerDashboardParams): Promise<Result<PartnerDashboardView, DomainError>> {
    const all = await this.resources.resourcesOf(userId);
    const selected = params.recurso ?? null;
    const scope = selected ? all.filter((r) => keyOf(r) === selected) : all;
    if (selected && scope.length === 0) return err(new NotFoundError("Recurso"));

    const to = localDate(this.clock());
    const from = addDays(to, -(params.periodo - 1));
    const previousFrom = addDays(from, -params.periodo);

    // De quem é cada entidade consultada (live_view chega pela transmissão; o resto pelo próprio recurso).
    const owner = new Map<string, string>();
    const refs: Required<EntityRefs> = { place: [], event: [], mission: [], live: [] };
    for (const r of scope) {
      refs[r.type].push(r.id);
      owner.set(`${r.type}:${r.id}`, keyOf(r));
      for (const streamId of r.liveStreamIds) {
        refs.live.push(streamId);
        owner.set(`live:${streamId}`, keyOf(r));
      }
    }

    const result = await this.metrics.execute({ refs, from: previousFrom, to });
    if (!result.ok) return result;
    const rows = result.value;

    const metricOf = (m: DailyMetric): Exclude<MetricId, "conversion"> | null =>
      m.kind === "view" && (m.entityType === "place" || m.entityType === "event")
        ? "views"
        : m.kind === "favorite"
          ? "favorites"
          : m.kind === "quero_ir"
            ? "queroIr"
            : m.kind === "live_view"
              ? "liveViews"
              : m.kind === "checkin"
                ? "checkins"
                : null;

    const days = daysBetween(from, to);
    const zero = () => ({ views: 0, favorites: 0, queroIr: 0, liveViews: 0, checkins: 0 });
    const byDay = new Map(days.map((d) => [d, zero()]));
    const previous = zero();
    const byResource = new Map(scope.map((r) => [keyOf(r), zero()]));

    for (const m of rows) {
      const metric = metricOf(m);
      if (!metric) continue;
      if (m.day < from) {
        previous[metric] += m.total;
        continue;
      }
      byDay.get(m.day)![metric] += m.total;
      const resource = owner.get(`${m.entityType}:${m.entityId}`);
      if (resource) byResource.get(resource)![metric] += m.total;
    }

    const totals = zero();
    for (const day of byDay.values()) for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += day[k];

    const counts: MetricView[] = (["views", "favorites", "queroIr", "liveViews", "checkins"] as const).map((id) => ({
      id,
      label: labels[id],
      total: totals[id],
      previousTotal: previous[id],
      unit: "count",
      series: days.map((day) => ({ day, value: byDay.get(day)![id] })),
    }));
    counts.push({
      id: "conversion",
      label: labels.conversion,
      total: conversion(totals.views, totals.queroIr + totals.checkins),
      previousTotal: conversion(previous.views, previous.queroIr + previous.checkins),
      unit: "percent",
      series: days.map((day) => {
        const d = byDay.get(day)!;
        return { day, value: conversion(d.views, d.queroIr + d.checkins) };
      }),
    });

    return ok({
      period: params.periodo,
      from,
      to,
      resources: all.map((r) => ({ key: keyOf(r), type: r.type, name: r.name })),
      selected,
      metrics: counts,
      breakdown: scope
        .map((r) => ({ key: keyOf(r), type: r.type, name: r.name, totals: byResource.get(keyOf(r))! }))
        .sort((a, b) => b.totals.views - a.totals.views || a.name.localeCompare(b.name, "pt-BR")),
    });
  }
}
