import type { FavoriteKey } from "@/modules/favorites";
import type { UserPreferences } from "@/modules/identity";
import type { Logger } from "@/shared/observability";
import { ANONYMOUS_PROFILE, type TasteProfile, type TasteProfileReader } from "../domain/taste-profile";

/** O que o adaptador usa das APIs públicas de identity (preferências) e favorites. */
export type TasteSources = {
  preferencesOf(userId: string): Promise<UserPreferences>;
  favoriteKeysOf(user: { id: string }): Promise<FavoriteKey[]>;
};

/**
 * Perfil de gosto a partir das preferências (identity) e dos favoritos (favorites). Se os favoritos
 * falharem, a recomendação segue sem eles (logado); preferências sempre vêm completas de identity.
 */
export class TasteProfileFromModules implements TasteProfileReader {
  constructor(
    private readonly sources: TasteSources,
    private readonly log: Pick<Logger, "warn">,
  ) {}

  async profileOf(userId: string | null): Promise<TasteProfile> {
    if (!userId) return ANONYMOUS_PROFILE;
    const [preferences, favorites] = await Promise.all([
      this.sources.preferencesOf(userId),
      this.sources.favoriteKeysOf({ id: userId }).catch((error: unknown) => {
        this.log.warn("favoritos indisponíveis para a recomendação", { error: String(error) });
        return [] as FavoriteKey[];
      }),
    ]);
    return {
      categories: preferences.categories,
      budgetMax: preferences.budgetMax,
      radiusKm: preferences.radiusKm,
      groupSize: preferences.groupSize,
      favoriteKeys: new Set(favorites.map((f) => `${f.entityType}:${f.entityId}`)),
    };
  }
}
