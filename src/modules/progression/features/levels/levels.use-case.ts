import type { DomainEventPublisher } from "@/shared/events";
import { logger } from "@/shared/observability";
import { levelFor, type LevelStatus, type LevelUp, type LevelUpRepository, type XpBalanceReader } from "../../domain/levels";
import type { IncomingEvent } from "../xp-ledger/xp-ledger.use-case";
import { userIdSchema, xpGrantedSchema } from "./levels.schema";

/** Por quanto tempo o perfil destaca a subida de nível ("Você subiu de nível!"). */
export const LEVEL_UP_HIGHLIGHT_MS = 24 * 60 * 60 * 1000;

/**
 * RF33 — A cada XP creditado, recalcula o nível pelo saldo e, se é um nível novo, registra e publica
 * `progression.LevelReached`. Idempotente: o registro tem unique (usuário, nível), então créditos
 * simultâneos ou reprocessados publicam o evento uma vez só.
 */
export class TrackLevelUp {
  constructor(
    private readonly balances: XpBalanceReader,
    private readonly levelUps: Pick<LevelUpRepository, "record">,
    private readonly events: DomainEventPublisher,
  ) {}

  async onXpGranted(event: IncomingEvent): Promise<number | null> {
    const { userId } = xpGrantedSchema.parse(event.payload);
    const { level } = levelFor(await this.balances.balanceOf(userId));
    // O nível 1 é o ponto de partida: não é "alcançado".
    if (level <= 1 || !(await this.levelUps.record(userId, level))) return null;
    logger().info("nível alcançado", { level, eventId: event.id });
    await this.events.publish("progression.LevelReached", { userId, level });
    return level;
  }
}

export type LevelOverview = LevelStatus & {
  /** Último nível alcançado recentemente (feedback visual no perfil), ou null. */
  recentLevelUp: LevelUp | null;
};

/** Nível atual, progresso até o próximo e a subida recente, para o perfil. */
export class GetLevelOverview {
  constructor(
    private readonly balances: XpBalanceReader,
    private readonly levelUps: Pick<LevelUpRepository, "latest">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<LevelOverview> {
    const id = userIdSchema.parse(userId);
    const [balance, latest] = await Promise.all([this.balances.balanceOf(id), this.levelUps.latest(id)]);
    const status = levelFor(balance);
    const recent = latest && latest.level === status.level && this.now().getTime() - latest.reachedAt.getTime() < LEVEL_UP_HIGHLIGHT_MS;
    return { ...status, recentLevelUp: recent ? latest : null };
  }
}
