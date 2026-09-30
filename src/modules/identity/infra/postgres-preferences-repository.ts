import type { Sql } from "@/shared/db/sql";
import { isCategoryId } from "@/shared/catalog/categories";
import type { GroupSize, PreferencesRepository, UserPreferences } from "../domain/preferences";

type Row = { categories: string[]; budget_max: number | null; radius_km: number; group_size: GroupSize | null };

export class PostgresPreferencesRepository implements PreferencesRepository {
  constructor(private readonly sql: Sql) {}

  async find(userId: string): Promise<UserPreferences | null> {
    const [row] = await this.sql<Row[]>`
      select categories, budget_max, radius_km, group_size from identity.preferences where user_id = ${userId}`;
    if (!row) return null;
    return {
      // Categorias removidas do catálogo são ignoradas na leitura (sem quebrar quem já tinha salvo).
      categories: row.categories.filter(isCategoryId),
      budgetMax: row.budget_max,
      radiusKm: row.radius_km,
      groupSize: row.group_size,
    };
  }

  async save(userId: string, p: UserPreferences): Promise<void> {
    await this.sql`
      insert into identity.preferences (user_id, categories, budget_max, radius_km, group_size)
      values (${userId}, ${p.categories}, ${p.budgetMax}, ${p.radiusKm}, ${p.groupSize})
      on conflict (user_id) do update set
        categories = excluded.categories,
        budget_max = excluded.budget_max,
        radius_km = excluded.radius_km,
        group_size = excluded.group_size`;
  }
}
