/** Tipos de item que podem ser favoritados. Um tipo novo entra aqui e no `check` do banco. */
export const entityTypes = ["place", "event"] as const;
export type EntityType = (typeof entityTypes)[number];

/** Item favoritado: polimórfico, só o tipo e o id (o módulo não conhece places nem events). */
export type FavoriteKey = { entityType: EntityType; entityId: string };

export type Favorite = FavoriteKey & { createdAt: Date };

/** Favoritos do usuário. Roda como o próprio usuário (asUser): a RLS garante que cada um só mexe nos seus. */
export interface FavoriteRepository {
  /** Devolve true se criou; false se já existia (idempotente). */
  add(userId: string, key: FavoriteKey): Promise<boolean>;
  /** Devolve true se apagou; false se não existia (idempotente). */
  remove(userId: string, key: FavoriteKey): Promise<boolean>;
  has(userId: string, key: FavoriteKey): Promise<boolean>;
  listByUser(userId: string): Promise<Favorite[]>;
}

/**
 * Catálogo de um tipo de item (implementado com a API pública do módulo dono do item).
 * Um tipo novo é uma nova implementação, sem `if` nos casos de uso (OCP).
 */
export interface FavoriteTargetCatalog {
  exists(id: string): Promise<boolean>;
}

export type FavoriteTargets = Record<EntityType, FavoriteTargetCatalog>;
