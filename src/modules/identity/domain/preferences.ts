import type { CategoryId } from "@/shared/catalog/categories";

export const groupSizes = [
  { id: "sozinho", label: "Sozinho(a)" },
  { id: "casal", label: "Em casal" },
  { id: "amigos", label: "Com amigos" },
  { id: "familia", label: "Em família" },
] as const;

export type GroupSize = (typeof groupSizes)[number]["id"];

export const budgetOptions = [
  { value: 0, label: "Só programas gratuitos" },
  { value: 50, label: "Até R$ 50" },
  { value: 100, label: "Até R$ 100" },
  { value: 200, label: "Até R$ 200" },
] as const;

export const radiusOptions = [2, 5, 10, 20, 50] as const;

export type UserPreferences = {
  categories: CategoryId[];
  /** Gasto máximo típico por saída, em reais. `null` = sem limite definido. */
  budgetMax: number | null;
  /** Distância máxima que topa percorrer. */
  radiusKm: number;
  groupSize: GroupSize | null;
};

/** Padrões para quem ainda não configurou nada: recomendação ampla e perto. */
export const defaultPreferences: UserPreferences = { categories: [], budgetMax: null, radiusKm: 10, groupSize: null };

export interface PreferencesRepository {
  find(userId: string): Promise<UserPreferences | null>;
  save(userId: string, preferences: UserPreferences): Promise<void>;
}

/**
 * API pública para outros módulos (ex.: Recomendação). Sempre devolve preferências completas,
 * aplicando os padrões para quem ainda não configurou.
 */
export interface UserPreferencesReader {
  preferencesOf(userId: string): Promise<UserPreferences>;
}
