import type { CategoryId } from "@/shared/catalog/categories";

export type OsmTags = Record<string, string | undefined>;

type Rule = { key: string; values: readonly string[] | "*"; category: CategoryId };

/**
 * Mapeamento de tags do OpenStreetMap → categorias do LalaIA. A primeira regra que casar vence,
 * então as mais específicas vêm antes. Nova categoria ou tag = nova linha (sem mexer no código).
 */
export const osmCategoryRules: readonly Rule[] = [
  { key: "amenity", values: ["restaurant", "fast_food", "food_court"], category: "restaurantes" },
  { key: "amenity", values: ["bar", "pub", "biergarten"], category: "bares" },
  { key: "amenity", values: ["cafe", "ice_cream"], category: "cafes" },
  { key: "shop", values: ["bakery", "confectionery"], category: "cafes" },
  { key: "amenity", values: ["nightclub"], category: "festas" },
  { key: "amenity", values: ["marketplace"], category: "feiras" },
  { key: "amenity", values: ["theatre", "cinema"], category: "teatro" },
  { key: "amenity", values: ["music_venue", "events_venue"], category: "shows" },
  { key: "amenity", values: ["arts_centre", "library"], category: "cultura" },
  { key: "tourism", values: ["museum"], category: "cultura" },
  { key: "tourism", values: ["gallery"], category: "exposicoes" },
  { key: "tourism", values: ["zoo", "theme_park"], category: "infantil" },
  { key: "leisure", values: ["playground"], category: "infantil" },
  { key: "leisure", values: ["stadium", "sports_centre"], category: "esportes" },
  { key: "leisure", values: ["park", "garden", "nature_reserve", "water_park"], category: "ar-livre" },
  { key: "tourism", values: ["viewpoint"], category: "ar-livre" },
  { key: "shop", values: ["mall"], category: "compras" },
  { key: "tourism", values: ["attraction", "artwork"], category: "passeios" },
  { key: "historic", values: "*", category: "passeios" },
];

export function categoryFromOsmTags(tags: OsmTags): CategoryId | null {
  const rule = osmCategoryRules.find((r) => {
    const value = tags[r.key];
    return value !== undefined && (r.values === "*" || r.values.includes(value));
  });
  return rule?.category ?? null;
}
