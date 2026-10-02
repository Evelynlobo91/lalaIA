// Composição do módulo analytics (interna): usada pelo index.ts.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { TrackInteraction } from "./features/tracking/tracking.use-case";
import { AfterResponseRunner } from "./infra/after-response-runner";
import { PostgresInteractionStore } from "./infra/postgres-interaction-store";
import { GetInteractionTotals } from "./features/interaction-totals/interaction-totals";
import { PostgresInteractionTotals } from "./infra/postgres-interaction-totals";
import { GetDailyMetrics } from "./features/aggregations/aggregations.use-case";
import { PostgresDailyMetrics } from "./infra/postgres-daily-metrics";

export const trackInteraction = lazy(() => new TrackInteraction(new PostgresInteractionStore(sql()), new AfterResponseRunner()));

export const interactionTotalsUseCase = lazy(() => new GetInteractionTotals(new PostgresInteractionTotals(sql())));

export const dailyMetrics = lazy(() => new GetDailyMetrics(new PostgresDailyMetrics(sql())));
