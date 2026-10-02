import type { CategoryId } from "@/shared/catalog/categories";
import type { Address } from "./place";

/** Resumo para busca/reivindicação: inclui se o lugar já tem responsável (sem dizer quem). */
export type PlaceSummary = { id: string; name: string; categoryLabel: string; neighborhood: string | null; managed: boolean };

/** Dados que o dono pode editar. Localização e origem nunca mudam por aqui. */
export type EditablePlace = {
  id: string;
  managedBy: string | null;
  name: string;
  category: CategoryId;
  address: Pick<Address, "street" | "houseNumber" | "neighborhood">;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
};

export type PlaceEdit = Omit<EditablePlace, "id" | "managedBy">;

export interface PlaceOwnershipRepository {
  searchByName(query: string, limit: number): Promise<PlaceSummary[]>;
  summary(id: string): Promise<PlaceSummary | null>;
  /** Vários resumos numa consulta só (evita N consultas em listas). */
  summaries(ids: string[]): Promise<PlaceSummary[]>;
  /** Marca o dono (idempotente). Devolve false se o lugar não existir. */
  assignOwner(placeId: string, userId: string): Promise<boolean>;
  managedBy(userId: string): Promise<PlaceSummary[]>;
  findEditable(id: string): Promise<EditablePlace | null>;
  /** Grava como o próprio usuário (RLS): só o dono ou admin consegue. */
  update(actorId: string, id: string, edit: PlaceEdit): Promise<boolean>;
}
