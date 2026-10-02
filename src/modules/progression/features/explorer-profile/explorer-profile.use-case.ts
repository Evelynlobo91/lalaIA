import { categories } from "@/shared/catalog/categories";
import { exploredCategories, type ExplorerActivity, type ExplorerActivitySource } from "../../domain/explorer-activity";
import { explorerProfileSchema } from "./explorer-profile.schema";

export type CategoryCount = { id: string; label: string; count: number };

/** O que a pessoa já descobriu na cidade (#68). Tudo derivado: nada é guardado como contador. */
export type ExplorerProfile = {
  /** Lugares favoritados ou visitados (etapas de missão), sem repetição. */
  placesDiscovered: number;
  placesVisited: number;
  placesFavorited: number;
  eventsFavorited: number;
  missionsCompleted: number;
  checkIns: number;
  /** Lugares descobertos e eventos favoritados por categoria, da mais explorada para a menos. */
  categories: CategoryCount[];
  /** Bairros explorados (dos lugares descobertos e dos eventos favoritados), em ordem alfabética. */
  neighborhoods: string[];
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));
const order = new Map<string, number>(categories.map((c, i) => [c.id, i]));

/** Contagens do perfil a partir da atividade (função pura). */
export function explorerProfileFrom(a: ExplorerActivity): ExplorerProfile {
  const counts = new Map<string, number>();
  for (const item of [...a.places, ...a.events]) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const neighborhoods = new Set([...a.places, ...a.events].flatMap((i) => (i.neighborhood?.trim() ? [i.neighborhood.trim()] : [])));
  return {
    placesDiscovered: new Set([...a.favoritePlaceIds, ...a.visitedPlaceIds]).size,
    placesVisited: new Set(a.visitedPlaceIds).size,
    placesFavorited: new Set(a.favoritePlaceIds).size,
    eventsFavorited: new Set(a.favoriteEventIds).size,
    missionsCompleted: a.completedMissions,
    checkIns: a.checkIns,
    categories: exploredCategories(a)
      .map((id) => ({ id, label: labels.get(id) ?? id, count: counts.get(id) ?? 0 }))
      .sort((x, y) => y.count - x.count || (order.get(x.id) ?? 99) - (order.get(y.id) ?? 99)),
    neighborhoods: [...neighborhoods].sort((x, y) => x.localeCompare(y, "pt-BR")),
  };
}

/** Perfil de explorador do usuário da sessão, montado pelas APIs públicas dos módulos de origem. */
export class GetExplorerProfile {
  constructor(private readonly activity: ExplorerActivitySource) {}

  async execute(userId: string): Promise<ExplorerProfile> {
    const input = explorerProfileSchema.parse({ userId });
    return explorerProfileFrom(await this.activity.activityOf(input.userId));
  }
}
