// Composição do módulo favorites (interna): usada pelas actions e pelo index.ts.
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { ListFavoriteKeys } from "./features/favorite-keys/favorite-keys";
import { ListMyFavorites } from "./features/fav-list/fav-list.use-case";
import { ToggleFavorite } from "./features/fav-toggle/fav-toggle.use-case";
import { RecordWantToGo } from "./features/want-to-go/want-to-go.use-case";
import { eventDirectory, favoriteTargets, placeDirectory } from "./infra/favorite-targets";
import { PostgresFavoriteRepository } from "./infra/postgres-favorite-repository";

export const favoriteRepository = lazy(() => new PostgresFavoriteRepository(sql()));
export const toggleFavorite = lazy(() => new ToggleFavorite(favoriteRepository(), favoriteTargets, domainEvents()));
export const listMyFavorites = lazy(() => new ListMyFavorites(favoriteRepository(), placeDirectory, eventDirectory));
export const recordWantToGo = lazy(() => new RecordWantToGo(favoriteTargets, domainEvents()));
export const listFavoriteKeys = lazy(() => new ListFavoriteKeys(favoriteRepository()));
