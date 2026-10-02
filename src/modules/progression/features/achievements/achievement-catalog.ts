import type { AchievementRule } from "../../domain/achievements";
import { CategoriesRule, FavoritePlacesRule, FirstCheckInRule, FirstMissionRule, LevelRule } from "./achievement-rules";

/**
 * Catálogo de conquistas, na ordem de exibição. Nova conquista = nova regra aqui (OCP): os casos de uso
 * não mudam. Os ids são gravados no banco: não renomeie uma conquista já publicada.
 */
export const ACHIEVEMENTS: readonly AchievementRule[] = [
  new FirstCheckInRule(),
  new FirstMissionRule(),
  new FavoritePlacesRule(5),
  new CategoriesRule(3),
  new LevelRule(3),
];
