// Composição do módulo favorites (interna): usada pelas actions e pelo index.ts.
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { ToggleFavorite } from "./features/fav-toggle/fav-toggle.use-case";
import { favoriteTargets } from "./infra/favorite-targets";
import { PostgresFavoriteRepository } from "./infra/postgres-favorite-repository";

export const favoriteRepository = lazy(() => new PostgresFavoriteRepository(sql()));
export const toggleFavorite = lazy(() => new ToggleFavorite(favoriteRepository(), favoriteTargets, domainEvents()));
