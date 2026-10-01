// Catálogos dos itens favoritáveis, pelas APIs públicas de places e events (sem tocar nas tabelas deles).
import { eventSummaries } from "@/modules/events";
import { placeSummary } from "@/modules/places";
import type { FavoriteTargetCatalog, FavoriteTargets } from "../domain/favorite";

export const placeTargets: FavoriteTargetCatalog = {
  exists: async (id) => (await placeSummary(id)) !== null,
};

export const eventTargets: FavoriteTargetCatalog = {
  exists: async (id) => (await eventSummaries([id])).length > 0,
};

export const favoriteTargets: FavoriteTargets = { place: placeTargets, event: eventTargets };
