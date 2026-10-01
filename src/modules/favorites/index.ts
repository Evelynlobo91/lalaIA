// API pública do módulo favorites (lugares e eventos salvos, "Quero ir").
import "./domain/events";
import { listMyFavorites } from "./composition";
import { favListSchema, type FavoriteTab } from "./features/fav-list/fav-list.schema";
import type { MyFavorites } from "./features/fav-list/fav-list.use-case";

export { FavoriteButton } from "./features/fav-toggle/ui/favorite-button";
export { FavoriteToggle } from "./features/fav-toggle/ui/favorite-toggle";
export { MyFavoritesView } from "./features/fav-list/ui/my-favorites";
export { entityTypes, type EntityType } from "./domain/favorite";
export type { FavoriteTab } from "./features/fav-list/fav-list.schema";
export type { MyFavorites, MyFavoriteEvent, MyFavoritePlace, EventTiming } from "./features/fav-list/fav-list.use-case";

/** Favoritos do usuário da sessão, separados por tipo. O id deve vir de requireUser/getCurrentUser. */
export function myFavorites(user: { id: string }): Promise<MyFavorites> {
  return listMyFavorites().execute(user.id);
}

/** Aba de /perfil/favoritos a partir da URL (valor inválido → "lugares"). */
export function favoritesTab(params: Record<string, string | string[] | undefined>): FavoriteTab {
  return favListSchema.parse({ aba: params.aba }).aba;
}
