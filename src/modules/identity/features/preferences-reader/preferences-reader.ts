import { defaultPreferences, type PreferencesRepository, type UserPreferences, type UserPreferencesReader } from "../../domain/preferences";

/** Implementação da API pública: sempre devolve preferências completas (padrões para quem não configurou). */
export class DefaultingPreferencesReader implements UserPreferencesReader {
  constructor(private readonly repository: Pick<PreferencesRepository, "find">) {}

  async preferencesOf(userId: string): Promise<UserPreferences> {
    return (await this.repository.find(userId)) ?? { ...defaultPreferences, categories: [] };
  }
}
