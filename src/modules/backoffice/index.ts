// API pública do módulo backoffice (operação interna da plataforma, área /admin).
import type { ModuleSubscriptions } from "@/shared/events";
import { getPlatformMetrics, listAuditLog, recordAudit } from "./composition";
import { auditedEventTypes } from "./features/audit-log/audit-events";
export { BackofficeNav } from "./features/shell/ui/backoffice-nav";
export { BACKOFFICE_HOME, backofficeSections, sectionsFor, type BackofficeSection } from "./features/shell/backoffice-sections";
export { ContentSearch } from "./features/manage-content/ui/content-search";
export { CONTENT_RETURN, contentHref, contentQuery, contentTabs, type ContentTab } from "./features/manage-content/content-tabs";

// Auditoria (#146).
export { AuditLogView } from "./features/audit-log/ui/audit-log-view";
export type { AuditView } from "./features/audit-log/audit-log.use-cases";

/** Trilha de auditoria para /admin/auditoria (só admin), com os filtros da URL. */
export function auditLogView(viewer: { isAdmin: boolean }, params: Record<string, unknown>) {
  return listAuditLog().execute(viewer, params);
}

/** O backoffice não é chamado pelos módulos: ele assina os eventos das ações administrativas (registrado no boot). */
export const subscriptions: ModuleSubscriptions = (bus) => {
  for (const type of auditedEventTypes) {
    bus.subscribe(type, (event) => recordAudit().fromEvent(event));
  }
};

// Métricas gerais (#145).
export { PlatformMetricsPanel } from "./features/platform-metrics/ui/platform-metrics-panel";
export type { PlatformMetricsView } from "./features/platform-metrics/platform-metrics.use-case";

/** Números gerais da plataforma para /admin/metricas (só admin), com o período da URL. */
export function platformMetricsView(viewer: { isAdmin: boolean }, params: Record<string, unknown>) {
  return getPlatformMetrics().execute(viewer, params);
}
