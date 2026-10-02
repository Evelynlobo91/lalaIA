// API pública do módulo progression (XP, níveis e conquistas).
import type { ModuleSubscriptions } from "@/shared/events";
import { grantXp, xpOverview } from "./composition";
import type { XpOverview } from "./features/xp-ledger/xp-ledger.use-case";

export { XpCard } from "./features/xp-ledger/ui/xp-card";
export type { XpOverview } from "./features/xp-ledger/xp-ledger.use-case";
export type { XpReason, XpTransaction } from "./domain/xp";

/** Saldo de XP e últimas transações do usuário (perfil). O id vem sempre da sessão. */
export function xpOverviewOf(userId: string, limit = 10): Promise<XpOverview> {
  return xpOverview().execute(userId, limit);
}

/**
 * Reações a eventos de outros módulos (registradas no boot, em src/bootstrap).
 * Missões não concedem XP: publicam o fato e este módulo credita no livro-razão (idempotente).
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("missions.StepCompleted", async (event) => {
    await grantXp().onStepCompleted(event);
  });
  bus.subscribe("missions.MissionCompleted", async (event) => {
    await grantXp().onMissionCompleted(event);
  });
};
