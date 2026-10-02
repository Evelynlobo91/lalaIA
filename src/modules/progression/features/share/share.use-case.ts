import type { AchievementRule } from "../../domain/achievements";
import { shareIdSchema } from "./share.schema";

/** Leitura pública de um desbloqueio pelo id (o link compartilhado). Só id, conquista, data e dono. */
export interface SharedAchievementReader {
  findByUnlockId(unlockId: string): Promise<{ achievementId: string; userId: string; unlockedAt: Date } | null>;
}

/** Primeiro nome de quem compartilhou (API pública do identity). Nada além disso aparece na página. */
export interface SharerNames {
  firstNameOf(userId: string): Promise<string | null>;
}

export type SharedAchievementView = {
  unlockId: string;
  title: string;
  description: string;
  /** "Ana" ou null (sem nome: a página diz "Alguém"). */
  firstName: string | null;
  unlockedAt: Date;
  /** "Desbloqueie essa experiência no LalaIA": aonde levar quem chegou pelo post. */
  cta: { href: string; label: string };
};

/**
 * Onde começar cada conquista ("Desbloqueie essa experiência"): as de lugares (favoritar, explorar
 * categorias) levam para os lugares; as de missão, check-in e nível, para as missões.
 */
export function ctaFor(achievementId: string): { href: string; label: string } {
  return achievementId.startsWith("favoritou-") || achievementId.startsWith("explorou-")
    ? { href: "/lugares", label: "Descobrir lugares em Joinville" }
    : { href: "/missoes", label: "Ver missões perto de você" };
}

/**
 * #70 (RF38) — Página pública de uma conquista compartilhada. O link só existe se a pessoa compartilhou,
 * mostra apenas o primeiro nome e some se ela excluir a conta (o desbloqueio sai em cascata).
 */
export class GetSharedAchievement {
  constructor(
    private readonly rules: readonly AchievementRule[],
    private readonly reader: SharedAchievementReader,
    private readonly names: SharerNames,
  ) {}

  async execute(unlockId: string): Promise<SharedAchievementView | null> {
    if (!shareIdSchema.safeParse(unlockId).success) return null;
    const unlock = await this.reader.findByUnlockId(unlockId);
    if (!unlock) return null;
    const rule = this.rules.find((r) => r.id === unlock.achievementId);
    if (!rule) return null;
    return {
      unlockId,
      title: rule.title,
      description: rule.description,
      firstName: await this.names.firstNameOf(unlock.userId),
      unlockedAt: unlock.unlockedAt,
      cta: ctaFor(rule.id),
    };
  }
}

/** Texto do post: curto, em primeira pessoa (quem compartilha é a própria pessoa). */
export function shareText(title: string): string {
  return `Desbloqueei a conquista "${title}" explorando Joinville no LalaIA. Bora?`;
}
