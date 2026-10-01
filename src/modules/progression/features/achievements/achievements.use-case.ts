import type { DomainEventPublisher } from "@/shared/events";
import { logger } from "@/shared/observability";
import type { AchievementFacts, AchievementFactsSource, AchievementRepository, AchievementRule } from "../../domain/achievements";
import { exploredCategories, type ExplorerActivitySource } from "../../domain/explorer-activity";
import { levelFor, type XpBalanceReader } from "../../domain/levels";
import type { IncomingEvent } from "../xp-ledger/xp-ledger.use-case";
import { achievementTriggerSchema } from "./achievements.schema";

/** Fatos das regras a partir da atividade do explorador (APIs públicas) e do saldo de XP. */
export class ExplorerAchievementFacts implements AchievementFactsSource {
  constructor(
    private readonly activity: ExplorerActivitySource,
    private readonly balances: XpBalanceReader,
  ) {}

  async factsOf(userId: string): Promise<AchievementFacts> {
    const [a, xp] = await Promise.all([this.activity.activityOf(userId), this.balances.balanceOf(userId)]);
    return {
      completedMissions: a.completedMissions,
      checkIns: a.checkIns,
      favoritePlaces: a.favoritePlaceIds.length,
      exploredCategories: exploredCategories(a).length,
      level: levelFor(xp).level,
    };
  }
}

/**
 * RF32 — Desbloqueia automaticamente as conquistas cujas regras foram atendidas, ao receber eventos de
 * domínio (etapa/missão concluída, favorito, nível). Idempotente: unique (usuário, conquista) no banco;
 * só um desbloqueio novo publica `progression.AchievementUnlocked` (que credita o bônus de XP).
 */
export class UnlockAchievements {
  constructor(
    private readonly rules: readonly AchievementRule[],
    private readonly facts: AchievementFactsSource,
    private readonly repo: Pick<AchievementRepository, "unlock" | "listUnlocked">,
    private readonly events: DomainEventPublisher,
  ) {}

  async onTrigger(event: IncomingEvent): Promise<string[]> {
    const { userId } = achievementTriggerSchema.parse(event.payload);
    const already = new Set((await this.repo.listUnlocked(userId)).map((u) => u.achievementId));
    const pending = this.rules.filter((r) => !already.has(r.id));
    if (pending.length === 0) return [];

    const facts = await this.facts.factsOf(userId);
    const unlocked: string[] = [];
    for (const rule of pending.filter((r) => r.isMet(facts))) {
      const unlockId = await this.repo.unlock(userId, rule.id);
      if (!unlockId) continue;
      unlocked.push(rule.id);
      logger().info("conquista desbloqueada", { achievementId: rule.id, eventId: event.id });
      await this.events.publish("progression.AchievementUnlocked", { userId, achievementId: rule.id, unlockId, title: rule.title, bonusXp: rule.bonusXp });
    }
    return unlocked;
  }
}

export type AchievementView = {
  id: string;
  title: string;
  description: string;
  hint: string;
  bonusXp: number;
  unlockedAt: Date | null;
};

export type AchievementsOverview = { unlocked: AchievementView[]; locked: AchievementView[]; total: number };

/** Galeria do perfil: desbloqueadas (mais recentes primeiro) e bloqueadas com a dica, na ordem do catálogo. */
export class GetAchievements {
  constructor(
    private readonly rules: readonly AchievementRule[],
    private readonly repo: Pick<AchievementRepository, "listUnlocked">,
  ) {}

  async execute(userId: string): Promise<AchievementsOverview> {
    const { userId: id } = achievementTriggerSchema.parse({ userId });
    const dates = new Map((await this.repo.listUnlocked(id)).map((u) => [u.achievementId, u.unlockedAt]));
    const views = this.rules.map((r) => ({ id: r.id, title: r.title, description: r.description, hint: r.hint, bonusXp: r.bonusXp, unlockedAt: dates.get(r.id) ?? null }));
    return {
      unlocked: views.filter((v) => v.unlockedAt).sort((a, b) => b.unlockedAt!.getTime() - a.unlockedAt!.getTime()),
      locked: views.filter((v) => !v.unlockedAt),
      total: views.length,
    };
  }
}
