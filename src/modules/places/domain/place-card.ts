import type { CategoryId } from "@/shared/catalog/categories";

/** Resumo de um lugar para listas e cards. */
export type PlaceCard = {
  id: string;
  name: string;
  category: CategoryId;
  neighborhood: string | null;
  openingHours: string | null;
};

/** Posição na lista ordenada por nome (paginação por cursor, estável mesmo com inserções). */
export type PlaceCursor = { name: string; id: string };

export interface PlaceReader {
  /** Lugares em ordem alfabética depois do cursor. Pede `limit + 1` para saber se há mais. */
  listAfter(cursor: PlaceCursor | null, limit: number): Promise<PlaceCard[]>;
}
