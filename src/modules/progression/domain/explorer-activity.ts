// O que a pessoa já fez na cidade, lido das APIs públicas dos módulos de origem (missions, favorites,
// places, events). Sem join entre schemas: cada módulo responde pelo que é dele.

export type DiscoveredItem = { id: string; category: string; neighborhood: string | null };

export type ExplorerActivity = {
  completedMissions: number;
  /** Etapas concluídas (check-ins validados no balcão). */
  checkIns: number;
  visitedPlaceIds: string[];
  favoritePlaceIds: string[];
  favoriteEventIds: string[];
  /** Categoria e bairro dos lugares descobertos (favoritados ou visitados), sem repetição. */
  places: DiscoveredItem[];
  /** Categoria e bairro dos eventos favoritados. */
  events: DiscoveredItem[];
};

export interface ExplorerActivitySource {
  /** O id vem sempre da sessão ou de um evento de domínio. */
  activityOf(userId: string): Promise<ExplorerActivity>;
}

/** Categorias exploradas: as dos lugares descobertos e dos eventos favoritados, sem repetição. */
export function exploredCategories(activity: Pick<ExplorerActivity, "places" | "events">): string[] {
  return [...new Set([...activity.places, ...activity.events].map((i) => i.category))];
}
