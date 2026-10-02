// Catálogos dos itens favoritáveis, pelas APIs públicas de places e events (sem tocar nas tabelas deles).
import { eventSummaries } from "@/modules/events";
import { placeSummaries, placeSummary } from "@/modules/places";
import type { FavoriteTargetCatalog, FavoriteTargets } from "../domain/favorite";
import type { FavoriteEventDirectory, FavoritePlaceDirectory } from "../domain/favorite-list";

export const placeTargets: FavoriteTargetCatalog = {
  exists: async (id) => (await placeSummary(id)) !== null,
};

export const eventTargets: FavoriteTargetCatalog = {
  exists: async (id) => (await eventSummaries([id])).length > 0,
};

export const favoriteTargets: FavoriteTargets = { place: placeTargets, event: eventTargets };

export const placeDirectory: FavoritePlaceDirectory = {
  summaries: async (ids) => (await placeSummaries(ids)).map((p) => ({ id: p.id, name: p.name, categoryLabel: p.categoryLabel, neighborhood: p.neighborhood })),
};

export const eventDirectory: FavoriteEventDirectory = {
  summaries: async (ids) =>
    (await eventSummaries(ids)).map((e) => ({
      id: e.id,
      title: e.title,
      categoryLabel: e.categoryLabel,
      placeName: e.placeName,
      neighborhood: e.neighborhood,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      cancelled: e.status === "cancelled",
      whenLabel: e.whenLabel,
    })),
};
