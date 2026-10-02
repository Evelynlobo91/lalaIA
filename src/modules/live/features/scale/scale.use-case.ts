import { z } from "zod";
import { CHAT_POLL_MS } from "../chat-feed/chat-feed.use-case";
import { PULSE_MS } from "../live-presence/live-presence.use-case";
import { LIVE_STATUS_POLL_MS } from "../stream-states/stream-states.schema";

/** Limites de consumo configuráveis (ambiente). Zero ou ausente = sem limite (sem alerta). */
export const scaleLimitsSchema = z.object({
  /** Espectadores simultâneos (todas as lives) a partir dos quais a plataforma precisa de atenção. */
  LIVE_MAX_CONCURRENT_VIEWERS: z.coerce.number().int().min(0).catch(0),
  /** Orçamento mensal de minutos de vídeo entregues (espectadores × minutos), como o provedor cobra. */
  LIVE_MONTHLY_VIEWER_MINUTES_BUDGET: z.coerce.number().int().min(0).catch(0),
});
export type ScaleLimits = { maxConcurrentViewers: number; monthlyViewerMinutesBudget: number };

export function scaleLimitsFrom(env: Record<string, string | undefined>): ScaleLimits {
  const parsed = scaleLimitsSchema.parse({ LIVE_MAX_CONCURRENT_VIEWERS: env.LIVE_MAX_CONCURRENT_VIEWERS ?? 0, LIVE_MONTHLY_VIEWER_MINUTES_BUDGET: env.LIVE_MONTHLY_VIEWER_MINUTES_BUDGET ?? 0 });
  return { maxConcurrentViewers: parsed.LIVE_MAX_CONCURRENT_VIEWERS, monthlyViewerMinutesBudget: parsed.LIVE_MONTHLY_VIEWER_MINUTES_BUDGET };
}

/** A partir de quanto do limite o alerta vira "atenção". 100% ou mais = "crítico". */
export const WARNING_RATIO = 0.8;

/**
 * Requisições por segundo que cada espectador gera na plataforma com a aba aberta (status + chat + pulso).
 * É o que a aplicação e o banco precisam aguentar; o vídeo em si sai do CDN do provedor.
 */
export const REQUESTS_PER_VIEWER_PER_SECOND = 1000 / LIVE_STATUS_POLL_MS + 1000 / CHAT_POLL_MS + 1000 / PULSE_MS;

export type AlertLevel = "ok" | "warning" | "critical";
export type ScaleAlert = { metric: "concurrent_viewers" | "monthly_viewer_minutes"; level: Exclude<AlertLevel, "ok">; value: number; limit: number; message: string };

export type LiveLoad = {
  liveStreams: number;
  viewersNow: number;
  /** Carga estimada na aplicação agora, em requisições por segundo. */
  requestsPerSecond: number;
  /** Maior audiência simultânea (somando as lives) num mesmo minuto, neste mês. */
  peakViewersThisMonth: number;
  /** Espectadores-minuto entregues neste mês (soma das amostras por minuto). */
  viewerMinutesThisMonth: number;
  limits: ScaleLimits;
  alerts: ScaleAlert[];
};

/** Leitura da audiência: agora (batimentos das abas) e do mês (amostras por minuto). */
export interface AudienceReader {
  now(): Promise<{ liveStreams: number; viewers: number }>;
  month(since: Date): Promise<{ viewerMinutes: number; peakViewers: number }>;
}

const number = new Intl.NumberFormat("pt-BR");

export function levelOf(value: number, limit: number): AlertLevel {
  if (limit <= 0) return "ok";
  return value >= limit ? "critical" : value >= limit * WARNING_RATIO ? "warning" : "ok";
}

/** Início do mês corrente no calendário de Joinville (UTC−3, sem horário de verão). */
export function monthStart(now: Date): Date {
  const local = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3));
}

/**
 * #56 — Carga das lives agora e consumo do mês, comparados com os limites configurados. Os alertas são
 * calculados aqui (função pura sobre a leitura), para a tela do backoffice e para a checagem agendada.
 */
export class GetLiveLoad {
  constructor(
    private readonly audience: AudienceReader,
    private readonly limits: () => ScaleLimits,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<LiveLoad> {
    const limits = this.limits();
    const [current, month] = await Promise.all([this.audience.now(), this.audience.month(monthStart(this.now()))]);
    const alerts: ScaleAlert[] = [];
    const concurrent = levelOf(current.viewers, limits.maxConcurrentViewers);
    if (concurrent !== "ok") {
      alerts.push({
        metric: "concurrent_viewers",
        level: concurrent,
        value: current.viewers,
        limit: limits.maxConcurrentViewers,
        message: `${number.format(current.viewers)} espectadores simultâneos (limite configurado: ${number.format(limits.maxConcurrentViewers)}).`,
      });
    }
    const budget = levelOf(month.viewerMinutes, limits.monthlyViewerMinutesBudget);
    if (budget !== "ok") {
      alerts.push({
        metric: "monthly_viewer_minutes",
        level: budget,
        value: month.viewerMinutes,
        limit: limits.monthlyViewerMinutesBudget,
        message: `${number.format(month.viewerMinutes)} minutos de vídeo entregues neste mês (orçamento: ${number.format(limits.monthlyViewerMinutesBudget)}).`,
      });
    }
    return {
      liveStreams: current.liveStreams,
      viewersNow: current.viewers,
      requestsPerSecond: Math.round(current.viewers * REQUESTS_PER_VIEWER_PER_SECOND * 10) / 10,
      peakViewersThisMonth: month.peakViewers,
      viewerMinutesThisMonth: month.viewerMinutes,
      limits,
      alerts,
    };
  }
}

type Reporter = { warn(message: string, fields?: Record<string, unknown>): void; capture(error: unknown, context?: Record<string, unknown>): void };

/**
 * Checagem agendada dos alertas de consumo: registra cada alerta no log e, se for crítico, manda para o
 * monitoramento de erros (onde o time já recebe notificação). Devolve a carga para quem chamou.
 */
export class CheckScaleAlerts {
  constructor(
    private readonly load: Pick<GetLiveLoad, "execute">,
    private readonly reporter: Reporter,
  ) {}

  async execute(): Promise<LiveLoad> {
    const load = await this.load.execute();
    for (const alert of load.alerts) {
      this.reporter.warn("alerta de consumo da live", { metric: alert.metric, level: alert.level, value: alert.value, limit: alert.limit });
      if (alert.level === "critical") this.reporter.capture(new Error(`Consumo da live acima do limite: ${alert.message}`), { metric: alert.metric, value: alert.value, limit: alert.limit });
    }
    return load;
  }
}
