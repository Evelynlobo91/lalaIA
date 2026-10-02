// Composição do módulo analytics (interna): usada pelo index.ts.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { TrackInteraction } from "./features/tracking/tracking.use-case";
import { AfterResponseRunner } from "./infra/after-response-runner";
import { PostgresInteractionStore } from "./infra/postgres-interaction-store";

export const trackInteraction = lazy(() => new TrackInteraction(new PostgresInteractionStore(sql()), new AfterResponseRunner()));
