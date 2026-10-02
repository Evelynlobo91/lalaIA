import type { CategoryId } from "@/shared/catalog/categories";

/** Quantas pessoas costumam sair juntas, pelo perfil ("com quem sai"). */
export type GroupSize = "sozinho" | "casal" | "amigos" | "familia";

/** O que o motor sabe do gosto da pessoa (preferências de identity + favoritos). */
export type TasteProfile = {
  categories: CategoryId[];
  /** Gasto máximo típico por saída, em reais (total). `null` = sem limite. */
  budgetMax: number | null;
  radiusKm: number;
  groupSize: GroupSize | null;
  /** Chaves `kind:id` dos favoritos (ex.: "place:<uuid>"). */
  favoriteKeys: ReadonlySet<string>;
};

/** Visitante (sem login): sem gosto conhecido, padrões amplos. */
export const ANONYMOUS_PROFILE: TasteProfile = { categories: [], budgetMax: null, radiusKm: 10, groupSize: null, favoriteKeys: new Set() };

export interface TasteProfileReader {
  /** Sempre devolve um perfil completo; `null` = visitante. */
  profileOf(userId: string | null): Promise<TasteProfile>;
}
