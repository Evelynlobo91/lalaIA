// Composição do módulo backoffice (interna): usada pelo index.ts.
import { eventCounts } from "@/modules/events";
import { userCounts, usersByIds } from "@/modules/identity";
import { liveCounts } from "@/modules/live";
import { missionCompletionCounts } from "@/modules/missions";
import { partnerCounts } from "@/modules/partners";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { AuditActors } from "./domain/audit";
import { ListAuditLog, RecordAudit } from "./features/audit-log/audit-log.use-cases";
import { GetPlatformMetrics } from "./features/platform-metrics/platform-metrics.use-case";
import { PostgresAuditLog } from "./infra/postgres-audit-log";

const auditLog = lazy(() => new PostgresAuditLog(sql()));

// Nome de quem agiu: pela API pública do módulo identity (nada de join com tabelas de outro módulo).
const actors: AuditActors = {
  names: async (ids) => new Map((await usersByIds(ids)).map((u) => [u.id, u.displayName])),
};

export const recordAudit = lazy(() => new RecordAudit(auditLog()));
export const listAuditLog = lazy(() => new ListAuditLog(auditLog(), actors));

// Métricas gerais (#145): cada número vem da API pública do módulo dono (sem join entre schemas).
export const getPlatformMetrics = lazy(
  () => new GetPlatformMetrics({ users: userCounts(), partners: partnerCounts(), events: eventCounts(), missions: missionCompletionCounts(), lives: liveCounts() }),
);
