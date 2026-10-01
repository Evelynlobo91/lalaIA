/** O que a lista de favoritos mostra de um lugar (vem da API pública de places). */
export type FavoritePlaceSummary = { id: string; name: string; categoryLabel: string; neighborhood: string | null };

/** O que a lista de favoritos mostra de um evento (vem da API pública de events). */
export type FavoriteEventSummary = {
  id: string;
  title: string;
  categoryLabel: string;
  placeName: string;
  neighborhood: string | null;
  startsAt: Date;
  endsAt: Date;
  cancelled: boolean;
  /** "sáb., 10 de out., 20:00 – 23:30" */
  whenLabel: string;
};

/** Portas em lote (uma consulta por tipo, sem N+1). Ids que não existem mais são ignorados. */
export interface FavoritePlaceDirectory {
  summaries(ids: string[]): Promise<FavoritePlaceSummary[]>;
}

export interface FavoriteEventDirectory {
  summaries(ids: string[]): Promise<FavoriteEventSummary[]>;
}
