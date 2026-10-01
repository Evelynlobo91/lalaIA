import { z } from "zod";

/** Janela de "recentes" das métricas no portal. */
export const METRICS_RECENT_DAYS = 7;

/** Totais vindos do Analytics (outro módulo): validados antes de chegar à tela. */
export const interactionTotalsSchema = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative()));
