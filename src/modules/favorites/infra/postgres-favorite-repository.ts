import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { EntityType, Favorite, FavoriteKey, FavoriteRepository } from "../domain/favorite";

type Row = { entity_type: EntityType; entity_id: string; created_at: Date };

/** Tudo roda como o próprio usuário (asUser): a RLS de favorites.favorites é a segunda camada de proteção. */
export class PostgresFavoriteRepository implements FavoriteRepository {
  constructor(private readonly sql: Sql) {}

  async add(userId: string, key: FavoriteKey): Promise<boolean> {
    const rows = await asUser(
      userId,
      (tx) => tx`
        insert into favorites.favorites (user_id, entity_type, entity_id)
        values (${userId}, ${key.entityType}, ${key.entityId})
        on conflict do nothing
        returning entity_id`,
      this.sql,
    );
    return rows.length > 0;
  }

  async remove(userId: string, key: FavoriteKey): Promise<boolean> {
    const rows = await asUser(
      userId,
      (tx) => tx`
        delete from favorites.favorites
        where user_id = ${userId} and entity_type = ${key.entityType} and entity_id = ${key.entityId}
        returning entity_id`,
      this.sql,
    );
    return rows.length > 0;
  }

  async has(userId: string, key: FavoriteKey): Promise<boolean> {
    const rows = await asUser(
      userId,
      (tx) => tx`
        select 1 from favorites.favorites
        where user_id = ${userId} and entity_type = ${key.entityType} and entity_id = ${key.entityId}`,
      this.sql,
    );
    return rows.length > 0;
  }

  async listByUser(userId: string): Promise<Favorite[]> {
    const rows = await asUser(
      userId,
      (tx) => tx<Row[]>`
        select entity_type, entity_id, created_at from favorites.favorites
        where user_id = ${userId}
        order by created_at desc, entity_id`,
      this.sql,
    );
    return rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, createdAt: r.created_at }));
  }
}
