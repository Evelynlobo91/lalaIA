import type { DomainEventPublisher } from "@/shared/events";
import { logger } from "@/shared/observability";
import type { MissionTitles, XpLedger, XpReason, XpTransaction } from "../../domain/xp";
import { achievementUnlockedSchema } from "../achievements/achievements.schema";
import { eventIdSchema, missionCompletedSchema, stepCompletedSchema } from "./xp-ledger.schema";

/** O que o handler precisa do evento: o id (deduplicação) e o payload (validado aqui com zod). */
export type IncomingEvent = { readonly id: string; readonly payload: unknown };

const labels: Record<XpReason, string> = { mission_step: "Etapa concluída", mission_completed: "Missão concluída", achievement: "Conquista" };

/**
 * RF31 — Credita XP a partir dos eventos de missões (o módulo missions não chama este módulo).
 * Idempotente: o livro tem unique pelo id do evento e pela origem (etapa/missão), então reprocessar
 * ou republicar o mesmo fato não credita duas vezes.
 */
export class GrantXp {
  constructor(
    private readonly ledger: Pick<XpLedger, "append">,
    private readonly missions: MissionTitles,
    private readonly events: DomainEventPublisher,
  ) {}

  async onStepCompleted(event: IncomingEvent): Promise<boolean> {
    const payload = stepCompletedSchema.parse(event.payload);
    return this.credit(event.id, payload.userId, "mission_step", payload.stepId, payload.xp, payload.missionId);
  }

  async onMissionCompleted(event: IncomingEvent): Promise<boolean> {
    const payload = missionCompletedSchema.parse(event.payload);
    return this.credit(event.id, payload.userId, "mission_completed", payload.missionId, payload.xp, payload.missionId);
  }

  /** Bônus da conquista (#67): a origem é o desbloqueio, único por usuário e conquista. Sem bônus, nada a creditar. */
  async onAchievementUnlocked(event: IncomingEvent): Promise<boolean> {
    const payload = achievementUnlockedSchema.parse(event.payload);
    if (payload.bonusXp === 0) return false;
    return this.credit(event.id, payload.userId, "achievement", payload.unlockId, payload.bonusXp, null, payload.title);
  }

  private async credit(eventId: string, userId: string, reason: XpReason, sourceId: string, amount: number, missionId: string | null, knownTitle?: string) {
    const title = knownTitle ?? (missionId ? await this.missions.titleOf(missionId).catch(() => null) : null);
    const credited = await this.ledger.append({
      eventId: eventIdSchema.parse(eventId),
      userId,
      reason,
      sourceId,
      amount,
      description: title ? `${labels[reason]} · ${title}`.slice(0, 200) : labels[reason],
    });
    logger().info(credited ? "xp creditado" : "xp já creditado (ignorado)", { reason, eventId, amount });
    // Só depois de gravar, e só quando a transação é nova (o nível é recalculado por quem assina).
    if (credited) await this.events.publish("progression.XpGranted", { userId, amount, reason });
    return credited;
  }
}

export type XpOverview = { balance: number; history: XpTransaction[] };

/** Saldo (soma do livro) e últimas transações do usuário, para o perfil. */
export class GetXpOverview {
  constructor(private readonly ledger: Pick<XpLedger, "balanceOf" | "history">) {}

  async execute(userId: string, limit = 10): Promise<XpOverview> {
    const [balance, history] = await Promise.all([this.ledger.balanceOf(userId), this.ledger.history(userId, limit)]);
    return { balance, history };
  }
}
