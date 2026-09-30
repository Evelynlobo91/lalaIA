import { z } from "zod";
import { categoryIds } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { budgetOptions, groupSizes, radiusOptions, type PreferencesRepository, type UserPreferences } from "../../domain/preferences";

const budgetValues = budgetOptions.map((b) => String(b.value));
const radiusValues = radiusOptions.map(String);
const groupIds = groupSizes.map((g) => g.id) as [string, ...string[]];

// FormData: checkboxes chegam como lista (getAll) e selects como texto; "" = não definido.
export const editPreferencesSchema = z.object({
  categories: z.array(z.enum(categoryIds, { error: "Categoria inválida." })).max(20).default([]),
  budgetMax: z
    .string()
    .refine((v) => v === "" || budgetValues.includes(v), "Orçamento inválido.")
    .transform((v) => (v === "" ? null : Number(v))),
  radiusKm: z
    .string()
    .refine((v) => radiusValues.includes(v), "Distância inválida.")
    .transform(Number),
  groupSize: z
    .string()
    .refine((v) => v === "" || groupIds.includes(v), "Opção inválida.")
    .transform((v) => (v === "" ? null : v)),
});

export type EditPreferencesInput = z.infer<typeof editPreferencesSchema>;

/** RF03 — Preferências que alimentam a recomendação (RF39, RF43). */
export class EditPreferences {
  constructor(private readonly preferences: Pick<PreferencesRepository, "save">) {}

  async execute(userId: string, input: EditPreferencesInput): Promise<Result<UserPreferences, DomainError>> {
    const preferences = { ...input, categories: [...new Set(input.categories)] } as UserPreferences;
    await this.preferences.save(userId, preferences);
    return ok(preferences);
  }
}
